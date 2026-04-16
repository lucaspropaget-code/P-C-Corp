from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
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
    return {"message": "Statut mis à jour"}

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
        
        return {"content": response, "content_type": request.content_type}
        
    except Exception as e:
        logging.error(f"AI Generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Erreur de génération: {str(e)}")

# Bank Reconciliation
@api_router.get("/accounting/reconciliation")
async def get_reconciliation(month: str, user: dict = Depends(require_role(["admin"]))):
    reconciliations = await db.reconciliations.find({"month": month}).to_list(100)
    return [{"id": str(r["_id"]), **{k:v for k,v in r.items() if k != "_id"}} for r in reconciliations]

@api_router.post("/accounting/reconciliation")
async def add_reconciliation(data: dict, user: dict = Depends(require_role(["admin"]))):
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["created_by"] = user["name"]
    result = await db.reconciliations.insert_one(data)
    data.pop("_id", None)
    return {"id": str(result.inserted_id), **data}

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
        if existing_orders == 0:
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
            ]
            
            for order in demo_orders:
                order["created_at"] = datetime.now(timezone.utc).isoformat()
                order["updated_at"] = datetime.now(timezone.utc).isoformat()
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
