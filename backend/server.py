from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
from bson import ObjectId
import bcrypt
import jwt
import secrets
import io
import csv
import json
import httpx

# LLM Integration
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI(title="Assault58 Back-Office API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# JWT Configuration
JWT_ALGORITHM = "HS256"

def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]

# Password Hashing
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# JWT Token Management
def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
        "type": "access"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "refresh"
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# Auth Helper
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non authentifié")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Type de token invalide")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Utilisateur non trouvé")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

# Role-based access
def require_role(allowed_roles: List[str]):
    async def role_checker(request: Request):
        user = await get_current_user(request)
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Accès non autorisé")
        return user
    return role_checker

# Pydantic Models
class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str

class ProductCreate(BaseModel):
    name: str
    sku: str
    description: Optional[str] = ""
    price: float
    quantity: int
    alert_threshold: int = 5
    category: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    alert_threshold: Optional[int] = None
    category: Optional[str] = None

class StockMovement(BaseModel):
    product_id: str
    quantity_change: int
    reason: str

class OrderCreate(BaseModel):
    customer_name: str
    customer_email: Optional[str] = ""
    customer_phone: Optional[str] = ""
    shipping_address: str
    items: List[dict]  # [{product_id, quantity, unit_price}]
    notes: Optional[str] = ""
    source: str = "manual"

class OrderStatusUpdate(BaseModel):
    status: str  # pending, shipped, delivered, cancelled

class CustomerCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class ExpenseCreate(BaseModel):
    description: str
    amount: float
    category: str
    date: Optional[str] = None
    notes: Optional[str] = ""

class WooCommerceConfig(BaseModel):
    store_url: str
    consumer_key: str
    consumer_secret: str

class AIContentRequest(BaseModel):
    prompt: str
    content_type: str = "social_post"  # social_post, description, email

# --- WooCommerce Sync Models ---
class WooSyncRequest(BaseModel):
    sync_type: str = "full"  # full, orders, products

# --- Bank Reconciliation Models ---
class BankTransactionCreate(BaseModel):
    date: str
    description: str
    amount: float
    transaction_type: str  # credit, debit
    reference: Optional[str] = ""
    notes: Optional[str] = ""

class BankTransactionMatch(BaseModel):
    match_type: str  # order, expense, none
    match_id: Optional[str] = None

# --- Social Media Models ---
class SocialPostCreate(BaseModel):
    platform: str  # facebook, instagram, tiktok, youtube
    content: str
    content_type: str = "social_post"
    status: str = "draft"  # draft, published
    scheduled_date: Optional[str] = None
    ai_generated: bool = False
    ai_prompt: Optional[str] = ""
    webhook_url: Optional[str] = ""

class SocialPostUpdate(BaseModel):
    content: Optional[str] = None
    status: Optional[str] = None
    platform: Optional[str] = None
    scheduled_date: Optional[str] = None
    metrics: Optional[dict] = None
    webhook_url: Optional[str] = None

class SocialMetricsUpdate(BaseModel):
    likes: Optional[int] = 0
    comments: Optional[int] = 0
    shares: Optional[int] = 0
    views: Optional[int] = 0
    reach: Optional[int] = 0

# Auth Endpoints
@api_router.post("/auth/login")
async def login(request: LoginRequest, response: Response):
    email = request.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email, user["role"])
    refresh_token = create_refresh_token(user_id)
    
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=False, samesite="lax", max_age=86400, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=False, samesite="lax", max_age=604800, path="/")
    
    return {
        "id": user_id,
        "email": user["email"],
        "name": user["name"],
        "role": user["role"]
    }

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Déconnexion réussie"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return user

# Dashboard Stats (Admin + Marketing)
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(require_role(["admin", "marketing"]))):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)
    
    # Revenue calculations
    pipeline_revenue = lambda start: [
        {"$match": {"created_at": {"$gte": start.isoformat()}, "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}}
    ]
    
    day_revenue = await db.orders.aggregate(pipeline_revenue(today_start)).to_list(1)
    week_revenue = await db.orders.aggregate(pipeline_revenue(week_start)).to_list(1)
    month_revenue = await db.orders.aggregate(pipeline_revenue(month_start)).to_list(1)
    
    # Pending orders count
    pending_count = await db.orders.count_documents({"status": "pending"})
    
    # Critical stock alerts
    critical_stock = await db.products.find(
        {"$expr": {"$lte": ["$quantity", "$alert_threshold"]}}
    ).to_list(100)
    
    # Latest orders
    latest_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    # Top selling products
    top_products_pipeline = [
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_name", "total_sold": {"$sum": "$items.quantity"}}},
        {"$sort": {"total_sold": -1}},
        {"$limit": 5}
    ]
    top_products = await db.orders.aggregate(top_products_pipeline).to_list(5)
    
    return {
        "revenue": {
            "day": day_revenue[0]["total"] if day_revenue else 0,
            "week": week_revenue[0]["total"] if week_revenue else 0,
            "month": month_revenue[0]["total"] if month_revenue else 0
        },
        "pending_orders": pending_count,
        "critical_stock": [{"_id": str(p["_id"]), **{k:v for k,v in p.items() if k != "_id"}} for p in critical_stock],
        "latest_orders": latest_orders,
        "top_products": top_products
    }

# Revenue trend for charts
@api_router.get("/dashboard/revenue-trend")
async def get_revenue_trend(days: int = 30, user: dict = Depends(require_role(["admin", "marketing"]))):
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(days=days)
    
    pipeline = [
        {"$match": {"created_at": {"$gte": start_date.isoformat()}, "status": {"$ne": "cancelled"}}},
        {"$addFields": {"date": {"$substr": ["$created_at", 0, 10]}}},
        {"$group": {"_id": "$date", "revenue": {"$sum": "$total_amount"}, "orders": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ]
    
    trend = await db.orders.aggregate(pipeline).to_list(100)
    return trend

# Products/Stock Management
@api_router.get("/products")
async def get_products(user: dict = Depends(require_role(["admin"]))):
    products_list = await db.products.find({}).to_list(1000)
    return [{"id": str(p["_id"]), **{k:v for k,v in p.items() if k != "_id"}} for p in products_list]

@api_router.post("/products")
async def create_product(product: ProductCreate, user: dict = Depends(require_role(["admin"]))):
    product_dict = product.model_dump()
    product_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    product_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.products.insert_one(product_dict)
    product_dict.pop("_id", None)
    return {"id": str(result.inserted_id), **product_dict}

@api_router.put("/products/{product_id}")
async def update_product(product_id: str, product: ProductUpdate, user: dict = Depends(require_role(["admin"]))):
    update_data = {k: v for k, v in product.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.products.update_one({"_id": ObjectId(product_id)}, {"$set": update_data})
    updated = await db.products.find_one({"_id": ObjectId(product_id)})
    return {"id": str(updated["_id"]), **{k:v for k,v in updated.items() if k != "_id"}}

@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(require_role(["admin"]))):
    await db.products.delete_one({"_id": ObjectId(product_id)})
    return {"message": "Produit supprimé"}

@api_router.post("/products/stock-movement")
async def record_stock_movement(movement: StockMovement, user: dict = Depends(require_role(["admin"]))):
    product = await db.products.find_one({"_id": ObjectId(movement.product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="Produit non trouvé")
    
    new_quantity = product["quantity"] + movement.quantity_change
    if new_quantity < 0:
        raise HTTPException(status_code=400, detail="Stock insuffisant")
    
    await db.products.update_one(
        {"_id": ObjectId(movement.product_id)},
        {"$set": {"quantity": new_quantity, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # Record movement history
    movement_record = {
        "product_id": movement.product_id,
        "product_name": product["name"],
        "quantity_change": movement.quantity_change,
        "previous_quantity": product["quantity"],
        "new_quantity": new_quantity,
        "reason": movement.reason,
        "user_id": user["_id"],
        "user_name": user["name"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.stock_movements.insert_one(movement_record)
    
    return {"message": "Mouvement enregistré", "new_quantity": new_quantity}

@api_router.get("/products/stock-history")
async def get_stock_history(product_id: Optional[str] = None, user: dict = Depends(require_role(["admin"]))):
    query = {"product_id": product_id} if product_id else {}
    movements = await db.stock_movements.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return movements

# Orders Management
@api_router.get("/orders")
async def get_orders(status: Optional[str] = None, user: dict = Depends(require_role(["admin"]))):
    query = {"status": status} if status else {}
    orders = await db.orders.find(query).sort("created_at", -1).to_list(1000)
    return [{"id": str(o["_id"]), **{k:v for k,v in o.items() if k != "_id"}} for o in orders]

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(require_role(["admin"]))):
    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    return {"id": str(order["_id"]), **{k:v for k,v in order.items() if k != "_id"}}

@api_router.post("/orders")
async def create_order(order: OrderCreate, user: dict = Depends(require_role(["admin"]))):
    # Calculate total
    total = sum(item["quantity"] * item["unit_price"] for item in order.items)
    
    order_dict = order.model_dump()
    order_dict["total_amount"] = total
    order_dict["status"] = "pending"
    order_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    order_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    order_dict["order_number"] = f"ORD-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(3).upper()}"
    
    # Update stock for each item
    for item in order.items:
        if "product_id" in item and item["product_id"]:
            await db.products.update_one(
                {"_id": ObjectId(item["product_id"])},
                {"$inc": {"quantity": -item["quantity"]}}
            )
    
    result = await db.orders.insert_one(order_dict)
    return {"id": str(result.inserted_id), **order_dict}

@api_router.put("/orders/{order_id}/status")
async def update_order_status(order_id: str, status_update: OrderStatusUpdate, request: Request):
    user = await get_current_user(request)
    
    # Stockeur can only mark as shipped
    if user["role"] == "stockeur" and status_update.status != "shipped":
        raise HTTPException(status_code=403, detail="Action non autorisée")
    
    if user["role"] not in ["admin", "stockeur"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    
    # Get current order for history
    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    
    old_status = order.get("status", "unknown")
    
    update_data = {
        "status": status_update.status,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    if status_update.status == "shipped":
        update_data["shipped_at"] = datetime.now(timezone.utc).isoformat()
        update_data["shipped_by"] = user["name"]
    elif status_update.status == "delivered":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": update_data})
    
    # Record status change history
    history_entry = {
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
        "old_status": old_status,
        "new_status": status_update.status,
        "changed_by": user["name"],
        "changed_by_role": user["role"],
        "changed_at": datetime.now(timezone.utc).isoformat()
    }
    await db.order_status_history.insert_one(history_entry)
    
    return {"message": "Statut mis à jour"}

@api_router.get("/orders/{order_id}/history")
async def get_order_status_history(order_id: str, user: dict = Depends(require_role(["admin"]))):
    history = await db.order_status_history.find({"order_id": order_id}, {"_id": 0}).sort("changed_at", -1).to_list(50)
    return history

# Stockeur specific endpoint - only pending orders
@api_router.get("/stockeur/orders")
async def get_stockeur_orders(user: dict = Depends(require_role(["stockeur", "admin"]))):
    orders = await db.orders.find({"status": "pending"}).sort("created_at", 1).to_list(1000)
    # Return only necessary info for stockeur
    return [{
        "id": str(o["_id"]),
        "order_number": o.get("order_number", ""),
        "customer_name": o["customer_name"],
        "shipping_address": o["shipping_address"],
        "items": o["items"],
        "created_at": o["created_at"]
    } for o in orders]

# Customers Management
@api_router.get("/customers")
async def get_customers(user: dict = Depends(require_role(["admin"]))):
    customers = await db.customers.find({}).sort("name", 1).to_list(1000)
    return [{"id": str(c["_id"]), **{k:v for k,v in c.items() if k != "_id"}} for c in customers]

@api_router.get("/customers/{customer_id}")
async def get_customer(customer_id: str, user: dict = Depends(require_role(["admin"]))):
    customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="Client non trouvé")
    
    # Get purchase history
    orders = await db.orders.find(
        {"$or": [{"customer_email": customer.get("email")}, {"customer_name": customer["name"]}]}
    ).sort("created_at", -1).to_list(100)
    
    return {
        "id": str(customer["_id"]),
        **{k:v for k,v in customer.items() if k != "_id"},
        "orders": [{"id": str(o["_id"]), **{k:v for k,v in o.items() if k != "_id"}} for o in orders]
    }

@api_router.post("/customers")
async def create_customer(customer: CustomerCreate, user: dict = Depends(require_role(["admin"]))):
    customer_dict = customer.model_dump()
    customer_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    customer_dict["total_orders"] = 0
    customer_dict["total_spent"] = 0
    result = await db.customers.insert_one(customer_dict)
    customer_dict.pop("_id", None)
    return {"id": str(result.inserted_id), **customer_dict}

@api_router.put("/customers/{customer_id}")
async def update_customer(customer_id: str, customer: CustomerUpdate, user: dict = Depends(require_role(["admin"]))):
    update_data = {k: v for k, v in customer.model_dump().items() if v is not None}
    await db.customers.update_one({"_id": ObjectId(customer_id)}, {"$set": update_data})
    updated = await db.customers.find_one({"_id": ObjectId(customer_id)})
    return {"id": str(updated["_id"]), **{k:v for k,v in updated.items() if k != "_id"}}

@api_router.delete("/customers/{customer_id}")
async def delete_customer(customer_id: str, user: dict = Depends(require_role(["admin"]))):
    await db.customers.delete_one({"_id": ObjectId(customer_id)})
    return {"message": "Client supprimé"}

# Expenses / Accounting
@api_router.get("/expenses")
async def get_expenses(month: Optional[str] = None, user: dict = Depends(require_role(["admin"]))):
    query = {}
    if month:  # Format: YYYY-MM
        query["date"] = {"$regex": f"^{month}"}
    expenses = await db.expenses.find(query).sort("date", -1).to_list(1000)
    return [{"id": str(e["_id"]), **{k:v for k,v in e.items() if k != "_id"}} for e in expenses]

@api_router.post("/expenses")
async def create_expense(expense: ExpenseCreate, user: dict = Depends(require_role(["admin"]))):
    expense_dict = expense.model_dump()
    if not expense_dict["date"]:
        expense_dict["date"] = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    expense_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    expense_dict["created_by"] = user["name"]
    result = await db.expenses.insert_one(expense_dict)
    expense_dict.pop("_id", None)
    return {"id": str(result.inserted_id), **expense_dict}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(require_role(["admin"]))):
    await db.expenses.delete_one({"_id": ObjectId(expense_id)})
    return {"message": "Dépense supprimée"}

@api_router.get("/accounting/summary")
async def get_accounting_summary(month: str, user: dict = Depends(require_role(["admin"]))):
    # Get orders for the month
    orders = await db.orders.find({
        "created_at": {"$regex": f"^{month}"},
        "status": {"$ne": "cancelled"}
    }).to_list(1000)
    
    total_revenue = sum(o.get("total_amount", 0) for o in orders)
    
    # Get expenses for the month
    expenses = await db.expenses.find({"date": {"$regex": f"^{month}"}}).to_list(1000)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    
    # Group expenses by category
    expenses_by_category = {}
    for e in expenses:
        cat = e.get("category", "Autre")
        expenses_by_category[cat] = expenses_by_category.get(cat, 0) + e.get("amount", 0)
    
    return {
        "month": month,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_profit": total_revenue - total_expenses,
        "orders_count": len(orders),
        "expenses_by_category": expenses_by_category
    }

# Excel Export
@api_router.get("/accounting/export")
async def export_accounting(month: str, user: dict = Depends(require_role(["admin"]))):
    import pandas as pd
    
    # Get orders
    orders = await db.orders.find({
        "created_at": {"$regex": f"^{month}"},
        "status": {"$ne": "cancelled"}
    }).to_list(1000)
    
    # Get expenses
    expenses = await db.expenses.find({"date": {"$regex": f"^{month}"}}).to_list(1000)
    
    # Create Excel file
    output = io.BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Orders sheet
        if orders:
            orders_data = [{
                "N° Commande": o.get("order_number", ""),
                "Date": o.get("created_at", "")[:10],
                "Client": o.get("customer_name", ""),
                "Montant TTC": o.get("total_amount", 0),
                "Statut": o.get("status", "")
            } for o in orders]
            pd.DataFrame(orders_data).to_excel(writer, sheet_name="Ventes", index=False)
        
        # Expenses sheet
        if expenses:
            expenses_data = [{
                "Date": e.get("date", ""),
                "Description": e.get("description", ""),
                "Catégorie": e.get("category", ""),
                "Montant": e.get("amount", 0)
            } for e in expenses]
            pd.DataFrame(expenses_data).to_excel(writer, sheet_name="Dépenses", index=False)
        
        # Summary sheet
        total_revenue = sum(o.get("total_amount", 0) for o in orders)
        total_expenses = sum(e.get("amount", 0) for e in expenses)
        summary_data = [{
            "Mois": month,
            "CA Total": total_revenue,
            "Dépenses Totales": total_expenses,
            "Bénéfice Net": total_revenue - total_expenses
        }]
        pd.DataFrame(summary_data).to_excel(writer, sheet_name="Résumé", index=False)
    
    output.seek(0)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=comptabilite_{month}.xlsx"}
    )

# WooCommerce Configuration
@api_router.get("/settings/woocommerce")
async def get_woocommerce_config(user: dict = Depends(require_role(["admin"]))):
    config = await db.settings.find_one({"type": "woocommerce"}, {"_id": 0})
    if config:
        # Mask the secret
        if config.get("consumer_secret"):
            config["consumer_secret"] = "***" + config["consumer_secret"][-4:]
    return config or {"store_url": "", "consumer_key": "", "consumer_secret": ""}

@api_router.post("/settings/woocommerce")
async def save_woocommerce_config(config: WooCommerceConfig, user: dict = Depends(require_role(["admin"]))):
    config_dict = config.model_dump()
    config_dict["type"] = "woocommerce"
    config_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.settings.update_one(
        {"type": "woocommerce"},
        {"$set": config_dict},
        upsert=True
    )
    return {"message": "Configuration WooCommerce sauvegardée"}

# AI Content Generation (Marketing)
@api_router.post("/ai/generate-content")
async def generate_ai_content(request: AIContentRequest, user: dict = Depends(require_role(["marketing", "admin"]))):
    try:
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="Clé API LLM non configurée")
        
        system_messages = {
            "social_post": """Tu es un expert en marketing digital pour Assault58, une marque française de lampes torches tactiques haut de gamme. 
Tu crées des posts engageants pour les réseaux sociaux (Facebook, Instagram). 
Ton ton est professionnel mais accessible, mettant en avant la qualité, la robustesse et le côté tactique des produits.
Utilise des emojis avec modération. Les posts doivent être courts et percutants.""",
            "description": """Tu es un rédacteur produit expert pour Assault58, marque de lampes torches tactiques. 
Tu rédiges des descriptions produits détaillées et persuasives, mettant en avant les caractéristiques techniques et les avantages pour l'utilisateur.""",
            "email": """Tu es responsable de la communication email pour Assault58. 
Tu rédiges des emails marketing professionnels et engageants pour promouvoir les produits et fidéliser les clients."""
        }
        
        chat = LlmChat(
            api_key=api_key,
            session_id=f"assault58-{user['_id']}-{datetime.now().timestamp()}",
            system_message=system_messages.get(request.content_type, system_messages["social_post"])
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=request.prompt)
        response = await chat.send_message(user_message)
        
        # Auto-save generated content to social_posts as draft
        post_doc = {
            "platform": "instagram",
            "content": response,
            "content_type": request.content_type,
            "status": "draft",
            "ai_generated": True,
            "ai_prompt": request.prompt,
            "webhook_url": "",
            "metrics": {"likes": 0, "comments": 0, "shares": 0, "views": 0, "reach": 0},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user["name"],
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        save_result = await db.social_posts.insert_one(post_doc)
        saved_id = str(save_result.inserted_id)
        
        return {"content": response, "content_type": request.content_type, "saved_post_id": saved_id}
        
    except Exception as e:
        logging.error(f"AI Generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur de génération: {str(e)}")

# Bank Reconciliation - Advanced
@api_router.get("/accounting/bank-transactions")
async def get_bank_transactions(month: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(require_role(["admin"]))):
    query = {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    if status:
        query["match_status"] = status
    txns = await db.bank_transactions.find(query).sort("date", -1).to_list(1000)
    return [{"id": str(t["_id"]), **{k:v for k,v in t.items() if k != "_id"}} for t in txns]

@api_router.post("/accounting/bank-transactions")
async def create_bank_transaction(txn: BankTransactionCreate, user: dict = Depends(require_role(["admin"]))):
    txn_dict = txn.model_dump()
    txn_dict["match_status"] = "unmatched"
    txn_dict["match_type"] = None
    txn_dict["match_id"] = None
    txn_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    txn_dict["created_by"] = user["name"]
    result = await db.bank_transactions.insert_one(txn_dict)
    txn_dict.pop("_id", None)
    return {"id": str(result.inserted_id), **txn_dict}

@api_router.post("/accounting/bank-import")
async def import_bank_csv(file: UploadFile = File(...), user: dict = Depends(require_role(["admin"]))):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    
    imported = 0
    errors = []
    for i, row in enumerate(reader):
        try:
            # Try to detect columns
            date_val = row.get("Date") or row.get("date") or row.get("Date opération") or row.get("DATE") or ""
            desc_val = row.get("Libellé") or row.get("Description") or row.get("Libelle") or row.get("LIBELLE") or row.get("description") or ""
            
            # Amount: try different column names
            amount_str = row.get("Montant") or row.get("Amount") or row.get("MONTANT") or "0"
            debit_str = row.get("Débit") or row.get("Debit") or row.get("DEBIT") or ""
            credit_str = row.get("Crédit") or row.get("Credit") or row.get("CREDIT") or ""
            
            if debit_str and credit_str:
                debit = float(debit_str.replace(",", ".").replace(" ", "").strip() or "0")
                credit = float(credit_str.replace(",", ".").replace(" ", "").strip() or "0")
                amount = credit - debit if credit else -debit
            else:
                amount = float(amount_str.replace(",", ".").replace(" ", "").strip() or "0")
            
            txn_type = "credit" if amount >= 0 else "debit"
            ref = row.get("Référence") or row.get("Reference") or row.get("Ref") or ""
            
            txn_dict = {
                "date": date_val.strip(),
                "description": desc_val.strip(),
                "amount": abs(amount),
                "transaction_type": txn_type,
                "reference": ref.strip(),
                "notes": "",
                "match_status": "unmatched",
                "match_type": None,
                "match_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": user["name"],
                "source": "csv_import"
            }
            await db.bank_transactions.insert_one(txn_dict)
            imported += 1
        except Exception as e:
            errors.append(f"Ligne {i+2}: {str(e)}")
    
    return {"imported": imported, "errors": errors}

@api_router.put("/accounting/bank-transactions/{txn_id}/match")
async def match_bank_transaction(txn_id: str, match: BankTransactionMatch, user: dict = Depends(require_role(["admin"]))):
    update_data = {
        "match_type": match.match_type,
        "match_id": match.match_id,
        "match_status": "matched" if match.match_type != "none" else "unmatched",
        "matched_at": datetime.now(timezone.utc).isoformat(),
        "matched_by": user["name"]
    }
    await db.bank_transactions.update_one({"_id": ObjectId(txn_id)}, {"$set": update_data})
    return {"message": "Transaction rapprochée"}

@api_router.delete("/accounting/bank-transactions/{txn_id}")
async def delete_bank_transaction(txn_id: str, user: dict = Depends(require_role(["admin"]))):
    await db.bank_transactions.delete_one({"_id": ObjectId(txn_id)})
    return {"message": "Transaction supprimée"}

@api_router.get("/accounting/reconciliation-summary")
async def get_reconciliation_summary(month: str, user: dict = Depends(require_role(["admin"]))):
    # Get bank transactions for month
    bank_txns = await db.bank_transactions.find({"date": {"$regex": f"^{month}"}}).to_list(1000)
    
    total_bank_credits = sum(t["amount"] for t in bank_txns if t["transaction_type"] == "credit")
    total_bank_debits = sum(t["amount"] for t in bank_txns if t["transaction_type"] == "debit")
    matched_count = sum(1 for t in bank_txns if t.get("match_status") == "matched")
    unmatched_count = sum(1 for t in bank_txns if t.get("match_status") != "matched")
    
    # Get system data for comparison
    orders = await db.orders.find({"created_at": {"$regex": f"^{month}"}, "status": {"$ne": "cancelled"}}).to_list(1000)
    expenses = await db.expenses.find({"date": {"$regex": f"^{month}"}}).to_list(1000)
    
    system_revenue = sum(o.get("total_amount", 0) for o in orders)
    system_expenses = sum(e.get("amount", 0) for e in expenses)
    
    return {
        "month": month,
        "bank": {"credits": total_bank_credits, "debits": total_bank_debits, "balance": total_bank_credits - total_bank_debits},
        "system": {"revenue": system_revenue, "expenses": system_expenses, "balance": system_revenue - system_expenses},
        "difference": (total_bank_credits - total_bank_debits) - (system_revenue - system_expenses),
        "matched": matched_count,
        "unmatched": unmatched_count,
        "total_transactions": len(bank_txns)
    }

# ========= WooCommerce Sync =========
async def _woo_api_request(method: str, endpoint: str, params: dict = None):
    """Helper to make WooCommerce REST API requests"""
    config = await db.settings.find_one({"type": "woocommerce"})
    if not config or not config.get("store_url") or not config.get("consumer_key") or not config.get("consumer_secret"):
        raise HTTPException(status_code=400, detail="Configuration WooCommerce manquante. Configurez d'abord vos clés API dans Paramètres.")
    
    url = f"{config['store_url'].rstrip('/')}/wp-json/wc/v3/{endpoint}"
    auth = (config["consumer_key"], config["consumer_secret"])
    
    async with httpx.AsyncClient(timeout=30) as client:
        if method == "GET":
            resp = await client.get(url, auth=auth, params=params or {})
        else:
            resp = await client.post(url, auth=auth, json=params or {})
        
        if resp.status_code >= 400:
            raise HTTPException(status_code=resp.status_code, detail=f"Erreur WooCommerce: {resp.text[:200]}")
        return resp.json()

@api_router.post("/woocommerce/sync")
async def sync_woocommerce(req: WooSyncRequest, user: dict = Depends(require_role(["admin"]))):
    log = {"type": req.sync_type, "started_at": datetime.now(timezone.utc).isoformat(), "status": "running", "triggered_by": user["name"], "details": {}}
    log_result = await db.sync_logs.insert_one(log)
    log_id = str(log_result.inserted_id)
    
    try:
        orders_imported = 0
        products_synced = 0
        
        if req.sync_type in ["full", "orders"]:
            # Fetch recent WooCommerce orders
            page = 1
            while True:
                woo_orders = await _woo_api_request("GET", "orders", {"page": page, "per_page": 50, "orderby": "date", "order": "desc"})
                if not woo_orders:
                    break
                
                for wo in woo_orders:
                    existing = await db.orders.find_one({"woo_id": wo["id"]})
                    if existing:
                        # Update status if changed
                        woo_status_map = {"processing": "pending", "completed": "delivered", "on-hold": "pending", "cancelled": "cancelled", "refunded": "cancelled"}
                        new_status = woo_status_map.get(wo["status"], "pending")
                        if existing.get("status") != new_status:
                            await db.orders.update_one({"_id": existing["_id"]}, {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}})
                        continue
                    
                    # Map WooCommerce order to our format
                    items = []
                    for li in wo.get("line_items", []):
                        items.append({
                            "product_id": "",
                            "product_name": li.get("name", ""),
                            "quantity": li.get("quantity", 1),
                            "unit_price": float(li.get("price", 0))
                        })
                    
                    billing = wo.get("billing", {})
                    shipping = wo.get("shipping", {})
                    ship_addr = f"{shipping.get('address_1', '')} {shipping.get('address_2', '')}, {shipping.get('postcode', '')} {shipping.get('city', '')}".strip(", ")
                    if not ship_addr or ship_addr == ",":
                        ship_addr = f"{billing.get('address_1', '')} {billing.get('address_2', '')}, {billing.get('postcode', '')} {billing.get('city', '')}".strip(", ")
                    
                    woo_status_map = {"processing": "pending", "completed": "delivered", "on-hold": "pending", "cancelled": "cancelled", "refunded": "cancelled", "pending": "pending"}
                    
                    order_doc = {
                        "woo_id": wo["id"],
                        "order_number": f"WOO-{wo['number']}",
                        "customer_name": f"{billing.get('first_name', '')} {billing.get('last_name', '')}".strip(),
                        "customer_email": billing.get("email", ""),
                        "customer_phone": billing.get("phone", ""),
                        "shipping_address": ship_addr,
                        "items": items,
                        "total_amount": float(wo.get("total", 0)),
                        "status": woo_status_map.get(wo["status"], "pending"),
                        "source": "woocommerce",
                        "created_at": wo.get("date_created", datetime.now(timezone.utc).isoformat()),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.orders.insert_one(order_doc)
                    orders_imported += 1
                
                if len(woo_orders) < 50:
                    break
                page += 1
        
        if req.sync_type in ["full", "products"]:
            # Fetch WooCommerce products
            page = 1
            while True:
                woo_products = await _woo_api_request("GET", "products", {"page": page, "per_page": 50})
                if not woo_products:
                    break
                
                for wp in woo_products:
                    existing = await db.products.find_one({"woo_id": wp["id"]})
                    stock_qty = wp.get("stock_quantity") or 0
                    
                    if existing:
                        await db.products.update_one({"_id": existing["_id"]}, {"$set": {
                            "name": wp["name"],
                            "price": float(wp.get("price", 0) or 0),
                            "quantity": stock_qty,
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }})
                    else:
                        product_doc = {
                            "woo_id": wp["id"],
                            "name": wp["name"],
                            "sku": wp.get("sku", f"WOO-{wp['id']}"),
                            "description": wp.get("short_description", "")[:500],
                            "price": float(wp.get("price", 0) or 0),
                            "quantity": stock_qty,
                            "alert_threshold": 5,
                            "category": wp.get("categories", [{}])[0].get("name", "") if wp.get("categories") else "",
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                        await db.products.insert_one(product_doc)
                    products_synced += 1
                
                if len(woo_products) < 50:
                    break
                page += 1
        
        # Update log
        await db.sync_logs.update_one({"_id": ObjectId(log_id)}, {"$set": {
            "status": "success",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "details": {"orders_imported": orders_imported, "products_synced": products_synced}
        }})
        
        return {"message": "Synchronisation réussie", "orders_imported": orders_imported, "products_synced": products_synced}
    
    except HTTPException:
        await db.sync_logs.update_one({"_id": ObjectId(log_id)}, {"$set": {"status": "error", "completed_at": datetime.now(timezone.utc).isoformat()}})
        raise
    except Exception as e:
        await db.sync_logs.update_one({"_id": ObjectId(log_id)}, {"$set": {"status": "error", "completed_at": datetime.now(timezone.utc).isoformat(), "error": str(e)}})
        raise HTTPException(status_code=500, detail=f"Erreur de synchronisation: {str(e)}")

@api_router.post("/woocommerce/webhook")
async def woocommerce_webhook(request: Request):
    """Receive real-time webhook from WooCommerce"""
    try:
        body = await request.json()
        topic = request.headers.get("X-WC-Webhook-Topic", "")
        
        if topic.startswith("order."):
            wo = body
            billing = wo.get("billing", {})
            shipping = wo.get("shipping", {})
            ship_addr = f"{shipping.get('address_1', '')} {shipping.get('address_2', '')}, {shipping.get('postcode', '')} {shipping.get('city', '')}".strip(", ")
            if not ship_addr or ship_addr == ",":
                ship_addr = f"{billing.get('address_1', '')} {billing.get('address_2', '')}, {billing.get('postcode', '')} {billing.get('city', '')}".strip(", ")
            
            items = [{"product_id": "", "product_name": li.get("name", ""), "quantity": li.get("quantity", 1), "unit_price": float(li.get("price", 0))} for li in wo.get("line_items", [])]
            woo_status_map = {"processing": "pending", "completed": "delivered", "on-hold": "pending", "cancelled": "cancelled", "refunded": "cancelled", "pending": "pending"}
            
            existing = await db.orders.find_one({"woo_id": wo.get("id")})
            if existing:
                await db.orders.update_one({"_id": existing["_id"]}, {"$set": {
                    "status": woo_status_map.get(wo.get("status", ""), "pending"),
                    "items": items,
                    "total_amount": float(wo.get("total", 0)),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }})
            else:
                order_doc = {
                    "woo_id": wo.get("id"),
                    "order_number": f"WOO-{wo.get('number', '')}",
                    "customer_name": f"{billing.get('first_name', '')} {billing.get('last_name', '')}".strip(),
                    "customer_email": billing.get("email", ""),
                    "customer_phone": billing.get("phone", ""),
                    "shipping_address": ship_addr,
                    "items": items,
                    "total_amount": float(wo.get("total", 0)),
                    "status": woo_status_map.get(wo.get("status", ""), "pending"),
                    "source": "woocommerce",
                    "created_at": wo.get("date_created", datetime.now(timezone.utc).isoformat()),
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
                await db.orders.insert_one(order_doc)
            
            # Log webhook
            await db.sync_logs.insert_one({
                "type": "webhook",
                "topic": topic,
                "woo_id": wo.get("id"),
                "status": "success",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "triggered_by": "webhook"
            })
        
        return {"status": "ok"}
    except Exception as e:
        logging.error(f"Webhook error: {str(e)}")
        return {"status": "error", "detail": str(e)}

@api_router.get("/woocommerce/sync-history")
async def get_sync_history(user: dict = Depends(require_role(["admin"]))):
    logs = await db.sync_logs.find({}).sort("started_at", -1).limit(50).to_list(50)
    return [{"id": str(l["_id"]), **{k:v for k,v in l.items() if k != "_id"}} for l in logs]

@api_router.get("/woocommerce/webhook-url")
async def get_webhook_url(user: dict = Depends(require_role(["admin"]))):
    frontend_url = os.environ.get("FRONTEND_URL", "")
    webhook_url = f"{frontend_url}/api/woocommerce/webhook" if frontend_url else ""
    return {"webhook_url": webhook_url}

# ========= Social Media Dashboard =========
@api_router.get("/social/posts")
async def get_social_posts(platform: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(require_role(["marketing", "admin"]))):
    query = {}
    if platform:
        query["platform"] = platform
    if status:
        query["status"] = status
    posts = await db.social_posts.find(query).sort("created_at", -1).to_list(500)
    return [{"id": str(p["_id"]), **{k:v for k,v in p.items() if k != "_id"}} for p in posts]

@api_router.post("/social/posts")
async def create_social_post(post: SocialPostCreate, user: dict = Depends(require_role(["marketing", "admin"]))):
    post_dict = post.model_dump()
    post_dict["metrics"] = {"likes": 0, "comments": 0, "shares": 0, "views": 0, "reach": 0}
    post_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    post_dict["created_by"] = user["name"]
    post_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    if not post_dict.get("webhook_url"):
        post_dict["webhook_url"] = ""
    if not post_dict.get("ai_prompt"):
        post_dict["ai_prompt"] = ""
    result = await db.social_posts.insert_one(post_dict)
    post_dict.pop("_id", None)
    return {"id": str(result.inserted_id), **post_dict}

@api_router.put("/social/posts/{post_id}")
async def update_social_post(post_id: str, update: SocialPostUpdate, user: dict = Depends(require_role(["marketing", "admin"]))):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.social_posts.update_one({"_id": ObjectId(post_id)}, {"$set": update_data})
    updated = await db.social_posts.find_one({"_id": ObjectId(post_id)})
    if not updated:
        raise HTTPException(status_code=404, detail="Post non trouvé")
    return {"id": str(updated["_id"]), **{k:v for k,v in updated.items() if k != "_id"}}

@api_router.put("/social/posts/{post_id}/metrics")
async def update_post_metrics(post_id: str, metrics: SocialMetricsUpdate, user: dict = Depends(require_role(["marketing", "admin"]))):
    metrics_dict = {k: v for k, v in metrics.model_dump().items() if v is not None}
    await db.social_posts.update_one({"_id": ObjectId(post_id)}, {"$set": {"metrics": metrics_dict, "updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Métriques mises à jour"}

@api_router.delete("/social/posts/{post_id}")
async def delete_social_post(post_id: str, user: dict = Depends(require_role(["marketing", "admin"]))):
    await db.social_posts.delete_one({"_id": ObjectId(post_id)})
    return {"message": "Post supprimé"}

@api_router.get("/social/metrics")
async def get_social_metrics(user: dict = Depends(require_role(["marketing", "admin"]))):
    pipeline = [
        {"$match": {"status": "published"}},
        {"$group": {
            "_id": "$platform",
            "posts_count": {"$sum": 1},
            "total_likes": {"$sum": "$metrics.likes"},
            "total_comments": {"$sum": "$metrics.comments"},
            "total_shares": {"$sum": "$metrics.shares"},
            "total_views": {"$sum": "$metrics.views"},
            "total_reach": {"$sum": "$metrics.reach"}
        }}
    ]
    by_platform = await db.social_posts.aggregate(pipeline).to_list(10)
    
    # Global stats
    total_posts = await db.social_posts.count_documents({})
    published_posts = await db.social_posts.count_documents({"status": "published"})
    draft_posts = await db.social_posts.count_documents({"status": "draft"})
    ai_generated = await db.social_posts.count_documents({"ai_generated": True})
    
    return {
        "by_platform": by_platform,
        "totals": {
            "total_posts": total_posts,
            "published": published_posts,
            "drafts": draft_posts,
            "ai_generated": ai_generated
        }
    }

# Include the router
app.include_router(api_router)

# CORS - include all possible origins
cors_origins = [os.environ.get("FRONTEND_URL", "http://localhost:3000")]
extra_origins = os.environ.get("CORS_ORIGINS", "")
if extra_origins and extra_origins != "*":
    cors_origins.extend([o.strip() for o in extra_origins.split(",") if o.strip()])
elif extra_origins == "*":
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins if "*" not in cors_origins else [],
    allow_origin_regex=r"https://.*\.preview\.emergentagent\.com" if "*" not in cors_origins else None,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Startup event - seed users and demo data
@app.on_event("startup")
async def startup_event():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.products.create_index("sku", unique=True)
    await db.orders.create_index("order_number")
    
    # Seed users
    users_to_seed = [
        {"email": os.environ.get("ADMIN_EMAIL", "admin@assault58.com"), "password": os.environ.get("ADMIN_PASSWORD", "Admin58!Secure"), "name": "Administrateur", "role": "admin"},
        {"email": os.environ.get("STOCKEUR_EMAIL", "stockeur@leac.com"), "password": os.environ.get("STOCKEUR_PASSWORD", "Stockeur58!Leac"), "name": "Équipe Léac", "role": "stockeur"},
        {"email": os.environ.get("MARKETING_EMAIL", "marketing@assault58.com"), "password": os.environ.get("MARKETING_PASSWORD", "Marketing58!Pro"), "name": "Marketing Assault58", "role": "marketing"}
    ]
    
    for user_data in users_to_seed:
        existing = await db.users.find_one({"email": user_data["email"]})
        if not existing:
            hashed = hash_password(user_data["password"])
            await db.users.insert_one({
                "email": user_data["email"],
                "password_hash": hashed,
                "name": user_data["name"],
                "role": user_data["role"],
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            logger.info(f"User created: {user_data['email']}")
        elif not verify_password(user_data["password"], existing["password_hash"]):
            await db.users.update_one(
                {"email": user_data["email"]},
                {"$set": {"password_hash": hash_password(user_data["password"])}}
            )
            logger.info(f"User password updated: {user_data['email']}")
    
    # Seed demo products
    demo_products = [
        {"name": "Assault58 Pro X1000", "sku": "A58-PX1000", "description": "Lampe torche tactique 1000 lumens, étanche IP68", "price": 89.90, "quantity": 45, "alert_threshold": 10, "category": "Pro"},
        {"name": "Assault58 Ultra X2000", "sku": "A58-UX2000", "description": "Lampe torche tactique 2000 lumens, rechargeable USB-C", "price": 129.90, "quantity": 28, "alert_threshold": 8, "category": "Ultra"},
        {"name": "Assault58 Compact C500", "sku": "A58-CC500", "description": "Lampe de poche compacte 500 lumens, EDC", "price": 49.90, "quantity": 67, "alert_threshold": 15, "category": "Compact"},
        {"name": "Assault58 Tactical T1500", "sku": "A58-TT1500", "description": "Lampe tactique professionnelle 1500 lumens, strobe", "price": 159.90, "quantity": 5, "alert_threshold": 10, "category": "Tactical"},
        {"name": "Assault58 Mini M300", "sku": "A58-MM300", "description": "Mini lampe porte-clés 300 lumens", "price": 29.90, "quantity": 120, "alert_threshold": 20, "category": "Mini"},
    ]
    
    for product in demo_products:
        existing = await db.products.find_one({"sku": product["sku"]})
        if not existing:
            product["created_at"] = datetime.now(timezone.utc).isoformat()
            product["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.products.insert_one(product)
            logger.info(f"Product created: {product['name']}")
    
    # Seed demo customers
    demo_customers = [
        {"name": "Jean Dupont", "email": "jean.dupont@email.com", "phone": "06 12 34 56 78", "address": "15 Rue de la Paix, 75001 Paris"},
        {"name": "Marie Martin", "email": "marie.martin@email.com", "phone": "06 98 76 54 32", "address": "8 Avenue des Champs-Élysées, 75008 Paris"},
        {"name": "Pierre Bernard", "email": "p.bernard@email.com", "phone": "07 11 22 33 44", "address": "23 Rue du Commerce, 69001 Lyon"},
    ]
    
    for customer in demo_customers:
        existing = await db.customers.find_one({"email": customer["email"]})
        if not existing:
            customer["created_at"] = datetime.now(timezone.utc).isoformat()
            customer["total_orders"] = 0
            customer["total_spent"] = 0
            await db.customers.insert_one(customer)
            logger.info(f"Customer created: {customer['name']}")
    
    # Seed demo orders
    products = await db.products.find({}).to_list(10)
    if products:
        existing_orders = await db.orders.count_documents({})
        if existing_orders < 5:
            import random
            demo_orders = [
                {"customer_name": "Jean Dupont", "customer_email": "jean.dupont@email.com", "shipping_address": "15 Rue de la Paix, 75001 Paris", 
                 "items": [{"product_id": str(products[0]["_id"]), "product_name": products[0]["name"], "quantity": 2, "unit_price": products[0]["price"]}],
                 "total_amount": products[0]["price"] * 2, "status": "pending", "source": "woocommerce",
                 "order_number": f"ORD-{datetime.now().strftime('%Y%m%d')}-A1B2C3"},
                {"customer_name": "Marie Martin", "customer_email": "marie.martin@email.com", "shipping_address": "8 Avenue des Champs-Élysées, 75008 Paris",
                 "items": [{"product_id": str(products[1]["_id"]), "product_name": products[1]["name"], "quantity": 1, "unit_price": products[1]["price"]}],
                 "total_amount": products[1]["price"], "status": "shipped", "source": "woocommerce",
                 "order_number": f"ORD-{datetime.now().strftime('%Y%m%d')}-D4E5F6"},
                {"customer_name": "Pierre Bernard", "customer_email": "p.bernard@email.com", "shipping_address": "23 Rue du Commerce, 69001 Lyon",
                 "items": [{"product_id": str(products[2]["_id"]), "product_name": products[2]["name"], "quantity": 3, "unit_price": products[2]["price"]},
                          {"product_id": str(products[4]["_id"]), "product_name": products[4]["name"], "quantity": 2, "unit_price": products[4]["price"]}],
                 "total_amount": products[2]["price"] * 3 + products[4]["price"] * 2, "status": "delivered", "source": "manual",
                 "order_number": f"ORD-{datetime.now().strftime('%Y%m%d')}-G7H8I9"},
                # 8 new demo orders
                {"customer_name": "Sophie Leroy", "customer_email": "s.leroy@email.com", "shipping_address": "42 Boulevard Haussmann, 75009 Paris",
                 "items": [{"product_id": str(products[0]["_id"]), "product_name": products[0]["name"], "quantity": 1, "unit_price": products[0]["price"]},
                          {"product_id": str(products[3]["_id"]), "product_name": products[3]["name"], "quantity": 1, "unit_price": products[3]["price"]}],
                 "total_amount": products[0]["price"] + products[3]["price"], "status": "pending", "source": "woocommerce",
                 "order_number": "ORD-20260415-K1L2M3"},
                {"customer_name": "Thomas Moreau", "customer_email": "t.moreau@email.com", "shipping_address": "7 Rue de la République, 13001 Marseille",
                 "items": [{"product_id": str(products[1]["_id"]), "product_name": products[1]["name"], "quantity": 2, "unit_price": products[1]["price"]}],
                 "total_amount": products[1]["price"] * 2, "status": "shipped", "source": "woocommerce",
                 "order_number": "ORD-20260414-N4O5P6"},
                {"customer_name": "Camille Petit", "customer_email": "c.petit@email.com", "shipping_address": "15 Place Bellecour, 69002 Lyon",
                 "items": [{"product_id": str(products[4]["_id"]), "product_name": products[4]["name"], "quantity": 5, "unit_price": products[4]["price"]}],
                 "total_amount": products[4]["price"] * 5, "status": "delivered", "source": "manual",
                 "order_number": "ORD-20260413-Q7R8S9"},
                {"customer_name": "Lucas Dubois", "customer_email": "l.dubois@email.com", "shipping_address": "3 Rue Foch, 34000 Montpellier",
                 "items": [{"product_id": str(products[3]["_id"]), "product_name": products[3]["name"], "quantity": 1, "unit_price": products[3]["price"]}],
                 "total_amount": products[3]["price"], "status": "cancelled", "source": "woocommerce",
                 "order_number": "ORD-20260412-T1U2V3"},
                {"customer_name": "Emma Garnier", "customer_email": "e.garnier@email.com", "shipping_address": "28 Rue Alsace-Lorraine, 31000 Toulouse",
                 "items": [{"product_id": str(products[2]["_id"]), "product_name": products[2]["name"], "quantity": 2, "unit_price": products[2]["price"]},
                          {"product_id": str(products[0]["_id"]), "product_name": products[0]["name"], "quantity": 1, "unit_price": products[0]["price"]}],
                 "total_amount": products[2]["price"] * 2 + products[0]["price"], "status": "pending", "source": "woocommerce",
                 "order_number": "ORD-20260411-W4X5Y6"},
                {"customer_name": "Hugo Roux", "customer_email": "h.roux@email.com", "shipping_address": "12 Quai des Chartrons, 33000 Bordeaux",
                 "items": [{"product_id": str(products[1]["_id"]), "product_name": products[1]["name"], "quantity": 1, "unit_price": products[1]["price"]},
                          {"product_id": str(products[4]["_id"]), "product_name": products[4]["name"], "quantity": 3, "unit_price": products[4]["price"]}],
                 "total_amount": products[1]["price"] + products[4]["price"] * 3, "status": "shipped", "source": "manual",
                 "order_number": "ORD-20260410-Z7A8B9"},
                {"customer_name": "Léa Fournier", "customer_email": "l.fournier@email.com", "shipping_address": "5 Place Stanislas, 54000 Nancy",
                 "items": [{"product_id": str(products[0]["_id"]), "product_name": products[0]["name"], "quantity": 3, "unit_price": products[0]["price"]}],
                 "total_amount": products[0]["price"] * 3, "status": "delivered", "source": "woocommerce",
                 "order_number": "ORD-20260409-C1D2E3"},
                {"customer_name": "Nathan Lambert", "customer_email": "n.lambert@email.com", "shipping_address": "18 Rue de Siam, 29200 Brest",
                 "items": [{"product_id": str(products[3]["_id"]), "product_name": products[3]["name"], "quantity": 2, "unit_price": products[3]["price"]},
                          {"product_id": str(products[2]["_id"]), "product_name": products[2]["name"], "quantity": 1, "unit_price": products[2]["price"]}],
                 "total_amount": products[3]["price"] * 2 + products[2]["price"], "status": "cancelled", "source": "woocommerce",
                 "order_number": "ORD-20260408-F4G5H6"},
            ]
            
            days_offset = [0, 0, 0, 1, 2, 3, 4, 3, 5, 6, 7]
            for i, order in enumerate(demo_orders):
                order_date = datetime.now(timezone.utc) - timedelta(days=days_offset[i] if i < len(days_offset) else 0)
                order["created_at"] = order_date.isoformat()
                order["updated_at"] = order_date.isoformat()
                order["status_history"] = [{"old_status": "new", "new_status": order["status"], "changed_by": "Système", "changed_at": order_date.isoformat()}]
                await db.orders.insert_one(order)
                logger.info(f"Order created: {order['order_number']}")
    
    # Write test credentials
    Path("/app/memory").mkdir(exist_ok=True)
    with open("/app/memory/test_credentials.md", "w") as f:
        f.write("# Test Credentials for Assault58 Back-Office\n\n")
        f.write("## Admin Account\n")
        f.write(f"- Email: {os.environ.get('ADMIN_EMAIL', 'admin@assault58.com')}\n")
        f.write(f"- Password: {os.environ.get('ADMIN_PASSWORD', 'Admin58!Secure')}\n")
        f.write("- Role: admin\n\n")
        f.write("## Stockeur Account (Léac)\n")
        f.write(f"- Email: {os.environ.get('STOCKEUR_EMAIL', 'stockeur@leac.com')}\n")
        f.write(f"- Password: {os.environ.get('STOCKEUR_PASSWORD', 'Stockeur58!Leac')}\n")
        f.write("- Role: stockeur\n\n")
        f.write("## Marketing Account\n")
        f.write(f"- Email: {os.environ.get('MARKETING_EMAIL', 'marketing@assault58.com')}\n")
        f.write(f"- Password: {os.environ.get('MARKETING_PASSWORD', 'Marketing58!Pro')}\n")
        f.write("- Role: marketing\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- GET /api/auth/me\n")
    
    logger.info("Startup complete - users and demo data seeded")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
