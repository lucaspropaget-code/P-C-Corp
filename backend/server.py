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
import requests as sync_requests

# LLM Integration
from emergentintegrations.llm.chat import LlmChat, UserMessage

# Object Storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "assault58"
storage_key = None

def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    key = os.environ.get("EMERGENT_LLM_KEY")
    if not key:
        return None
    try:
        resp = sync_requests.post(f"{STORAGE_URL}/init", json={"emergent_key": key}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        return storage_key
    except Exception as e:
        logging.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise Exception("Storage not initialized")
    resp = sync_requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise Exception("Storage not initialized")
    resp = sync_requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

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
    category: str = "lampe_torche"  # lampe_torche, accessoire, autre
    photo_url: Optional[str] = ""
    weight: Optional[float] = None  # kg
    length: Optional[float] = None  # cm
    width: Optional[float] = None   # cm
    height: Optional[float] = None  # cm
    stock_location: str = "leac"    # leac, andre

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    quantity: Optional[int] = None
    alert_threshold: Optional[int] = None
    category: Optional[str] = None
    photo_url: Optional[str] = None
    weight: Optional[float] = None
    length: Optional[float] = None
    width: Optional[float] = None
    height: Optional[float] = None
    stock_location: Optional[str] = None

class StockMovement(BaseModel):
    product_id: str
    quantity_change: int
    reason: str
    movement_type: str = "normal"  # normal, gift_prospection

class OrderCreate(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: str
    shipping_address: str
    billing_address: Optional[str] = ""
    items: List[dict]
    notes: Optional[str] = ""
    source: str = "site"  # site, salon, autre

class OrderStatusUpdate(BaseModel):
    status: str  # pending, shipped, delivered, cancelled

class CustomerCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    status: str = "particulier"  # particulier, professionnel, gendarmerie, police, ecole_police, federation_chasse, autre
    latitude: Optional[float] = None
    longitude: Optional[float] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

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

# --- Invoice Models ---
class SalesInvoiceItem(BaseModel):
    description: str
    quantity: int = 1
    unit_price_ht: float
    tva_rate: float = 20.0

class SalesInvoiceCreate(BaseModel):
    customer_name: str
    customer_email: Optional[str] = ""
    customer_address: Optional[str] = ""
    billing_address: Optional[str] = ""
    shipping_address: Optional[str] = ""
    customer_id: Optional[str] = None
    items: List[dict]
    tva_rate: float = 20.0
    shipping_cost_ht: Optional[float] = 0
    notes: Optional[str] = ""
    status: str = "draft"
    payment_method: str = ""  # cb, paypal, virement, cheque, mollie, especes
    sale_source: str = "site"  # site, salon, autre

class SalesInvoiceUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class PurchaseInvoiceCreate(BaseModel):
    supplier: str
    date: Optional[str] = None
    amount_ht: float
    tva_rate: float = 20.0
    category: str = "other"  # stock, general, other
    description: Optional[str] = ""
    status: str = "to_pay"  # to_pay, paid
    reference: Optional[str] = ""

class PurchaseInvoiceUpdate(BaseModel):
    status: Optional[str] = None
    supplier: Optional[str] = None
    description: Optional[str] = None

class ComptableAccountUpdate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    name: Optional[str] = None

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
        "movement_type": movement.movement_type,
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
    if not order_dict.get("billing_address"):
        order_dict["billing_address"] = order_dict["shipping_address"]
    
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
    
    # Auto-generate invoice when delivered
    if status_update.status == "delivered":
        try:
            order_fresh = await db.orders.find_one({"_id": ObjectId(order_id)})
            await _generate_invoice_from_order(order_fresh, created_by=user["name"])
            logging.info(f"Auto-generated invoice for order {order_id}")
        except Exception as e:
            logging.error(f"Auto-invoice error: {e}")
    
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

# Auto-generate invoice from order
async def _generate_invoice_from_order(order: dict, created_by: str = "Système"):
    """Create a sales invoice from an order. Returns invoice id or None if already exists."""
    # Check if invoice already exists for this order
    existing = await db.invoices.find_one({"order_id": str(order.get("_id", order.get("id", "")))})
    if existing:
        return None
    
    now = datetime.now(timezone.utc)
    number = await _get_next_invoice_number("FA", now.year)
    
    tva_rate = 20.0
    items = []
    total_ht = 0
    for item in order.get("items", []):
        qty = item.get("quantity", 1)
        # unit_price from order is TTC, convert to HT
        unit_ttc = item.get("unit_price", 0)
        unit_ht = round(unit_ttc / (1 + tva_rate / 100), 2)
        line_ht = qty * unit_ht
        line_tva = round(line_ht * tva_rate / 100, 2)
        items.append({
            "description": item.get("product_name", "Produit"),
            "quantity": qty,
            "unit_price_ht": unit_ht,
            "tva_rate": tva_rate,
            "line_total_ht": round(line_ht, 2),
            "line_tva": line_tva,
            "line_total_ttc": round(line_ht + line_tva, 2)
        })
        total_ht += line_ht
    
    total_tva = round(total_ht * tva_rate / 100, 2)
    total_ttc = round(total_ht + total_tva, 2)
    
    inv = {
        "type": "sales",
        "number": number,
        "date": now.strftime("%Y-%m-%d"),
        "customer_name": order.get("customer_name", ""),
        "customer_email": order.get("customer_email", ""),
        "customer_address": order.get("shipping_address", ""),
        "items": items,
        "total_ht": round(total_ht, 2),
        "tva_rate": tva_rate,
        "total_tva": total_tva,
        "total_ttc": total_ttc,
        "status": "sent",
        "notes": f"Générée automatiquement depuis commande {order.get('order_number', '')}",
        "order_id": str(order.get("_id", order.get("id", ""))),
        "order_number": order.get("order_number", ""),
        "created_at": now.isoformat(),
        "created_by": created_by,
        "updated_at": now.isoformat()
    }
    
    result = await db.invoices.insert_one(inv)
    inv.pop("_id", None)
    return {"id": str(result.inserted_id), **inv}

@api_router.post("/orders/{order_id}/generate-invoice")
async def generate_invoice_from_order(order_id: str, user: dict = Depends(require_role(["admin"]))):
    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    
    # Check existing
    existing = await db.invoices.find_one({"order_id": order_id})
    if existing:
        return {"message": "Facture déjà existante", "invoice_number": existing.get("number"), "already_exists": True}
    
    inv = await _generate_invoice_from_order(order, created_by=user["name"])
    if not inv:
        raise HTTPException(status_code=400, detail="Impossible de générer la facture")
    
    return {"message": f"Facture {inv['number']} générée", "invoice": inv, "already_exists": False}

# ========= Reminder System =========
REMINDER_TEMPLATES = {
    7: {"level": "rappel", "subject": "Rappel de paiement - Facture {number}",
        "tone": "Poli et amical. Rappeler que la facture est en attente de paiement depuis 7 jours."},
    14: {"level": "relance", "subject": "Relance - Facture {number} en attente",
         "tone": "Plus ferme mais professionnel. Mentionner que c'est la deuxième relance, 14 jours sans paiement."},
    30: {"level": "mise_en_demeure", "subject": "Mise en demeure - Facture {number}",
         "tone": "Formel et sérieux. Dernière relance avant actions de recouvrement. 30 jours d'impayé."}
}

@api_router.get("/invoices/reminders")
async def get_reminders(invoice_id: Optional[str] = None, user: dict = Depends(require_role(["admin"]))):
    query = {"invoice_id": invoice_id} if invoice_id else {}
    reminders = await db.reminders.find(query).sort("created_at", -1).to_list(500)
    return [{"id": str(r["_id"]), **{k:v for k,v in r.items() if k != "_id"}} for r in reminders]

@api_router.post("/invoices/{invoice_id}/remind")
async def create_reminder(invoice_id: str, user: dict = Depends(require_role(["admin"]))):
    inv = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not inv:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    
    if inv.get("status") not in ["sent", "unpaid"]:
        raise HTTPException(status_code=400, detail="Les relances ne s'appliquent qu'aux factures envoyées ou impayées")
    
    # Calculate days since invoice
    inv_date = datetime.fromisoformat(inv["date"] + "T00:00:00+00:00") if "T" not in inv["date"] else datetime.fromisoformat(inv["date"])
    days_since = (datetime.now(timezone.utc) - inv_date).days
    
    # Determine reminder level
    if days_since >= 30:
        template = REMINDER_TEMPLATES[30]
    elif days_since >= 14:
        template = REMINDER_TEMPLATES[14]
    else:
        template = REMINDER_TEMPLATES[7]
    
    # Generate AI content for the reminder
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    ai_content = ""
    
    if api_key:
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"reminder-{datetime.now().timestamp()}",
                system_message=f"""Tu es le service comptabilité d'Assault58, marque de lampes torches tactiques.
Tu rédiges des emails de relance de paiement pour des factures impayées.
Ton: {template['tone']}
La facture est la n°{inv['number']} d'un montant de {inv.get('total_ttc', 0):.2f}€ TTC datée du {inv['date']}.
Le client est {inv.get('customer_name', 'Client')}.
Rédige uniquement le corps de l'email (pas l'objet). Sois concis (max 150 mots). Termine par les coordonnées bancaires fictives."""
            ).with_model("openai", "gpt-5.2")
            
            user_message = UserMessage(text=f"Rédige un email de {template['level']} pour la facture {inv['number']} impayée depuis {days_since} jours.")
            ai_content = await chat.send_message(user_message)
        except Exception as e:
            logging.error(f"AI reminder error: {e}")
            ai_content = f"[Erreur IA] Relance pour facture {inv['number']} - {inv.get('total_ttc', 0):.2f}€ TTC - {days_since} jours d'impayé."
    else:
        ai_content = f"Relance pour facture {inv['number']} - {inv.get('total_ttc', 0):.2f}€ TTC - {days_since} jours d'impayé."
    
    reminder = {
        "invoice_id": invoice_id,
        "invoice_number": inv.get("number", ""),
        "customer_name": inv.get("customer_name", ""),
        "customer_email": inv.get("customer_email", ""),
        "level": template["level"],
        "subject": template["subject"].format(number=inv.get("number", "")),
        "content": ai_content,
        "days_since_invoice": days_since,
        "amount_ttc": inv.get("total_ttc", 0),
        "status": "simulated",  # simulated = not sent, ready for n8n
        "webhook_url": "",  # Ready for n8n integration
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"]
    }
    
    result = await db.reminders.insert_one(reminder)
    reminder.pop("_id", None)
    
    # Update invoice status to unpaid if it was just "sent"
    if inv.get("status") == "sent":
        await db.invoices.update_one({"_id": ObjectId(invoice_id)}, {"$set": {"status": "unpaid", "updated_at": datetime.now(timezone.utc).isoformat()}})
    
    return {"id": str(result.inserted_id), **reminder}

@api_router.get("/invoices/reminders/pending")
async def get_pending_reminders(user: dict = Depends(require_role(["admin"]))):
    """Check which unpaid invoices need reminders"""
    unpaid = await db.invoices.find({"type": "sales", "status": {"$in": ["sent", "unpaid"]}}).to_list(500)
    
    pending = []
    now = datetime.now(timezone.utc)
    
    for inv in unpaid:
        inv_date = datetime.fromisoformat(inv["date"] + "T00:00:00+00:00") if "T" not in inv["date"] else datetime.fromisoformat(inv["date"])
        days = (now - inv_date).days
        
        # Get last reminder
        last_reminder = await db.reminders.find({"invoice_id": str(inv["_id"])}).sort("created_at", -1).limit(1).to_list(1)
        last_level = last_reminder[0]["level"] if last_reminder else None
        reminders_count = await db.reminders.count_documents({"invoice_id": str(inv["_id"])})
        
        needs_reminder = False
        next_level = "rappel"
        
        if days >= 30 and last_level != "mise_en_demeure":
            needs_reminder = True
            next_level = "mise_en_demeure"
        elif days >= 14 and last_level not in ["relance", "mise_en_demeure"]:
            needs_reminder = True
            next_level = "relance"
        elif days >= 7 and not last_reminder:
            needs_reminder = True
            next_level = "rappel"
        
        pending.append({
            "invoice_id": str(inv["_id"]),
            "invoice_number": inv.get("number", ""),
            "customer_name": inv.get("customer_name", ""),
            "customer_email": inv.get("customer_email", ""),
            "amount_ttc": inv.get("total_ttc", 0),
            "date": inv.get("date", ""),
            "days_since": days,
            "reminders_sent": reminders_count,
            "last_level": last_level,
            "needs_reminder": needs_reminder,
            "next_level": next_level
        })
    
    return sorted(pending, key=lambda x: x["days_since"], reverse=True)

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
# Static routes MUST be before parameterized routes
@api_router.get("/customers/map")
async def get_customers_map(user: dict = Depends(require_role(["admin"]))):
    customers = await db.customers.find({}).to_list(1000)
    return [{"id": str(c["_id"]), "name": c.get("name",""), "address": c.get("address",""), "status": c.get("status","particulier"), "latitude": c.get("latitude"), "longitude": c.get("longitude"), "total_orders": c.get("total_orders",0), "email": c.get("email",""), "phone": c.get("phone","")} for c in customers]

@api_router.get("/customers/search")
async def search_customers(q: str = "", user: dict = Depends(require_role(["admin"]))):
    if not q or len(q) < 1:
        customers = await db.customers.find({}).limit(10).to_list(10)
    else:
        customers = await db.customers.find({"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"email": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}}
        ]}).limit(10).to_list(10)
    return [{"id": str(c["_id"]), "name": c.get("name",""), "email": c.get("email",""), "phone": c.get("phone",""), "address": c.get("address",""), "status": c.get("status","")} for c in customers]

@api_router.get("/products/search")
async def search_products(q: str = "", user: dict = Depends(require_role(["admin"]))):
    if not q or len(q) < 1:
        products = await db.products.find({}).limit(10).to_list(10)
    else:
        products = await db.products.find({"$or": [
            {"name": {"$regex": q, "$options": "i"}},
            {"sku": {"$regex": q, "$options": "i"}}
        ]}).limit(10).to_list(10)
    return [{"id": str(p["_id"]), "name": p.get("name",""), "sku": p.get("sku",""), "price": p.get("price",0), "quantity": p.get("quantity",0)} for p in products]

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

# Customer notes/issues
@api_router.get("/customers/{customer_id}/notes")
async def get_customer_notes(customer_id: str, user: dict = Depends(require_role(["admin"]))):
    notes = await db.customer_notes.find({"customer_id": customer_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return notes

@api_router.post("/customers/{customer_id}/notes")
async def add_customer_note(customer_id: str, data: dict, user: dict = Depends(require_role(["admin"]))):
    note = {
        "customer_id": customer_id,
        "type": data.get("type", "note"),  # note, issue, resolution
        "content": data.get("content", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"]
    }
    await db.customer_notes.insert_one(note)
    return {"message": "Note ajoutée"}

# Photo upload
@api_router.post("/upload/photo")
async def upload_photo(file: UploadFile = File(...), user: dict = Depends(require_role(["admin"]))):
    content = await file.read()
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "jpg"
    content_type = file.content_type or f"image/{ext}"
    path = f"{APP_NAME}/products/{uuid.uuid4().hex}.{ext}"
    
    try:
        result = put_object(path, content, content_type)
        return {"url": result.get("url", result.get("public_url", "")), "path": path}
    except Exception as e:
        logging.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur upload: {str(e)}")

# Boxtal config
@api_router.get("/settings/boxtal")
async def get_boxtal_config(user: dict = Depends(require_role(["admin"]))):
    config = await db.settings.find_one({"type": "boxtal"}, {"_id": 0})
    if config and config.get("api_secret"):
        config["api_secret"] = "***" + config["api_secret"][-4:]
    return config or {"api_key": "", "api_secret": "", "mode": "test"}

@api_router.post("/settings/boxtal")
async def save_boxtal_config(data: dict, user: dict = Depends(require_role(["admin"]))):
    data["type"] = "boxtal"
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one({"type": "boxtal"}, {"$set": data}, upsert=True)
    return {"message": "Configuration Boxtal sauvegardée"}

# Simulated Boxtal shipping
@api_router.post("/shipping/create-label")
async def create_shipping_label(data: dict, request: Request):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "stockeur"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    
    order_id = data.get("order_id")
    shipping_method = data.get("method", "colissimo_domicile")  # colissimo_domicile, colissimo_relais
    
    order = await db.orders.find_one({"_id": ObjectId(order_id)})
    if not order:
        raise HTTPException(status_code=404, detail="Commande non trouvée")
    
    # Simulated label generation
    label = {
        "order_id": order_id,
        "order_number": order.get("order_number", ""),
        "tracking_number": f"{'6C' if shipping_method == 'colissimo_domicile' else '6R'}{secrets.token_hex(6).upper()}",
        "carrier": "Colissimo",
        "method": shipping_method,
        "method_label": "Colissimo Domicile" if shipping_method == "colissimo_domicile" else "Colissimo Point Relais",
        "status": "created",
        "customer_name": order.get("customer_name", ""),
        "shipping_address": order.get("shipping_address", ""),
        "weight": data.get("weight", 0.5),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["name"],
        "label_url": f"#simulated-label-{secrets.token_hex(4)}"
    }
    
    result = await db.shipping_labels.insert_one(label)
    label.pop("_id", None)
    
    # Update order with tracking
    await db.orders.update_one({"_id": ObjectId(order_id)}, {"$set": {
        "tracking_number": label["tracking_number"],
        "shipping_method": label["method_label"],
        "updated_at": datetime.now(timezone.utc).isoformat()
    }})
    
    return {"id": str(result.inserted_id), **label}

@api_router.get("/shipping/labels")
async def get_shipping_labels(order_id: Optional[str] = None, request: Request = None):
    user = await get_current_user(request)
    if user["role"] not in ["admin", "stockeur"]:
        raise HTTPException(status_code=403, detail="Accès non autorisé")
    query = {"order_id": order_id} if order_id else {}
    labels = await db.shipping_labels.find(query).sort("created_at", -1).to_list(500)
    return [{"id": str(l["_id"]), **{k:v for k,v in l.items() if k != "_id"}} for l in labels]

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

# ========= INVOICING =========

async def _get_next_invoice_number(prefix: str, year: int):
    """Auto-increment invoice number: FA-2026-0001 or FAA-2026-0001"""
    last = await db.invoices.find({"number": {"$regex": f"^{prefix}-{year}"}}).sort("number", -1).limit(1).to_list(1)
    if last:
        last_num = int(last[0]["number"].split("-")[-1])
        return f"{prefix}-{year}-{str(last_num + 1).zfill(4)}"
    return f"{prefix}-{year}-0001"

# Sales Invoices
@api_router.get("/invoices/sales")
async def get_sales_invoices(month: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(require_role(["admin", "comptable"]))):
    query = {"type": "sales"}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    if status:
        query["status"] = status
    invoices = await db.invoices.find(query).sort("created_at", -1).to_list(1000)
    return [{"id": str(inv["_id"]), **{k:v for k,v in inv.items() if k != "_id"}} for inv in invoices]

@api_router.post("/invoices/sales")
async def create_sales_invoice(invoice: SalesInvoiceCreate, user: dict = Depends(require_role(["admin"]))):
    now = datetime.now(timezone.utc)
    number = await _get_next_invoice_number("FA", now.year)
    
    # Calculate totals
    total_ht = 0
    items_with_totals = []
    for item in invoice.items:
        qty = item.get("quantity", 1)
        price = item.get("unit_price_ht", 0)
        tva = item.get("tva_rate", invoice.tva_rate)
        line_ht = qty * price
        line_tva = line_ht * tva / 100
        items_with_totals.append({**item, "line_total_ht": line_ht, "line_tva": line_tva, "line_total_ttc": line_ht + line_tva})
        total_ht += line_ht
    
    # Add shipping cost with TVA
    shipping_ht = invoice.shipping_cost_ht or 0
    shipping_tva = round(shipping_ht * invoice.tva_rate / 100, 2)
    
    total_tva = total_ht * invoice.tva_rate / 100 + shipping_tva
    total_ttc = total_ht + total_tva + shipping_ht + shipping_tva
    
    inv_dict = {
        "type": "sales",
        "number": number,
        "date": now.strftime("%Y-%m-%d"),
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "customer_address": invoice.customer_address,
        "billing_address": invoice.billing_address or invoice.customer_address,
        "shipping_address": invoice.shipping_address or invoice.customer_address,
        "customer_id": invoice.customer_id,
        "items": items_with_totals,
        "total_ht": round(total_ht + shipping_ht, 2),
        "shipping_cost_ht": shipping_ht,
        "shipping_tva": shipping_tva,
        "tva_rate": invoice.tva_rate,
        "total_tva": round(total_tva, 2),
        "total_ttc": round(total_ttc, 2),
        "status": invoice.status,
        "notes": invoice.notes,
        "payment_method": invoice.payment_method,
        "sale_source": invoice.sale_source,
        "created_at": now.isoformat(),
        "created_by": user["name"],
        "updated_at": now.isoformat()
    }
    
    result = await db.invoices.insert_one(inv_dict)
    inv_dict.pop("_id", None)
    return {"id": str(result.inserted_id), **inv_dict}

@api_router.put("/invoices/sales/{invoice_id}")
async def update_sales_invoice(invoice_id: str, update: SalesInvoiceUpdate, user: dict = Depends(require_role(["admin"]))):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one({"_id": ObjectId(invoice_id)}, {"$set": update_data})
    return {"message": "Facture mise à jour"}

@api_router.delete("/invoices/sales/{invoice_id}")
async def delete_sales_invoice(invoice_id: str, user: dict = Depends(require_role(["admin"]))):
    inv = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if inv and inv.get("status") not in ["draft", "importee"]:
        raise HTTPException(status_code=400, detail="Seuls les brouillons peuvent être supprimés")
    await db.invoices.delete_one({"_id": ObjectId(invoice_id)})
    return {"message": "Facture supprimée"}

# PDF Generation for sales invoice
@api_router.get("/invoices/sales/{invoice_id}/pdf")
async def generate_sales_invoice_pdf(invoice_id: str, user: dict = Depends(require_role(["admin", "comptable"]))):
    from fpdf import FPDF
    
    inv = await db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not inv:
        raise HTTPException(status_code=404, detail="Facture non trouvée")
    
    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    
    # Header
    pdf.set_font("Helvetica", "B", 22)
    pdf.cell(0, 12, "ASSAULT58", ln=True)
    pdf.set_font("Helvetica", "", 10)
    pdf.cell(0, 6, "Lampes torches tactiques", ln=True)
    pdf.cell(0, 6, "assault58.com", ln=True)
    pdf.ln(10)
    
    # Invoice info
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, f"FACTURE {inv['number']}", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 7, f"Date : {inv['date']}", ln=True)
    status_labels = {"draft": "Brouillon", "sent": "Envoyee", "paid": "Payee", "unpaid": "Impayee", "importee": "Importee"}
    pdf.cell(0, 7, f"Statut : {status_labels.get(inv['status'], inv['status'])}", ln=True)
    pdf.ln(8)
    
    # Customer
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 7, "Client :", ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, inv.get("customer_name", ""), ln=True)
    if inv.get("customer_email"):
        pdf.cell(0, 6, inv["customer_email"], ln=True)
    if inv.get("customer_address"):
        pdf.cell(0, 6, inv["customer_address"], ln=True)
    pdf.ln(10)
    
    # Table header
    pdf.set_fill_color(40, 40, 40)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 10)
    pdf.cell(80, 8, "Description", 1, 0, "L", True)
    pdf.cell(20, 8, "Qte", 1, 0, "C", True)
    pdf.cell(30, 8, "Prix HT", 1, 0, "R", True)
    pdf.cell(25, 8, "TVA %", 1, 0, "R", True)
    pdf.cell(35, 8, "Total TTC", 1, 1, "R", True)
    
    # Items
    pdf.set_text_color(0, 0, 0)
    pdf.set_font("Helvetica", "", 10)
    for item in inv.get("items", []):
        desc = item.get("description", "")[:40]
        qty = str(item.get("quantity", 1))
        price = f"{item.get('unit_price_ht', 0):.2f} EUR"
        tva = f"{item.get('tva_rate', inv.get('tva_rate', 20))}%"
        total = f"{item.get('line_total_ttc', 0):.2f} EUR"
        pdf.cell(80, 7, desc, 1, 0, "L")
        pdf.cell(20, 7, qty, 1, 0, "C")
        pdf.cell(30, 7, price, 1, 0, "R")
        pdf.cell(25, 7, tva, 1, 0, "R")
        pdf.cell(35, 7, total, 1, 1, "R")
    
    pdf.ln(5)
    
    # Totals
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(130, 8, "Total HT :", 0, 0, "R")
    pdf.cell(35, 8, f"{inv.get('total_ht', 0):.2f} EUR", 0, 1, "R")
    pdf.cell(130, 8, f"TVA ({inv.get('tva_rate', 20)}%) :", 0, 0, "R")
    pdf.cell(35, 8, f"{inv.get('total_tva', 0):.2f} EUR", 0, 1, "R")
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(130, 10, "Total TTC :", 0, 0, "R")
    pdf.cell(35, 10, f"{inv.get('total_ttc', 0):.2f} EUR", 0, 1, "R")
    
    if inv.get("notes"):
        pdf.ln(10)
        pdf.set_font("Helvetica", "I", 9)
        pdf.multi_cell(0, 5, f"Notes : {inv['notes']}")
    
    output = io.BytesIO()
    pdf_content = pdf.output()
    output.write(pdf_content)
    output.seek(0)
    
    return StreamingResponse(output, media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=facture_{inv['number']}.pdf"})

# Purchase Invoices
@api_router.get("/invoices/purchases")
async def get_purchase_invoices(month: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(require_role(["admin", "comptable"]))):
    query = {"type": "purchase"}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    if status:
        query["status"] = status
    invoices = await db.invoices.find(query).sort("created_at", -1).to_list(1000)
    return [{"id": str(inv["_id"]), **{k:v for k,v in inv.items() if k != "_id"}} for inv in invoices]

@api_router.post("/invoices/purchases")
async def create_purchase_invoice(invoice: PurchaseInvoiceCreate, user: dict = Depends(require_role(["admin"]))):
    now = datetime.now(timezone.utc)
    number = await _get_next_invoice_number("FAA", now.year)
    
    total_tva = invoice.amount_ht * invoice.tva_rate / 100
    total_ttc = invoice.amount_ht + total_tva
    
    inv_dict = {
        "type": "purchase",
        "number": number,
        "date": invoice.date or now.strftime("%Y-%m-%d"),
        "supplier": invoice.supplier,
        "description": invoice.description,
        "amount_ht": round(invoice.amount_ht, 2),
        "tva_rate": invoice.tva_rate,
        "total_tva": round(total_tva, 2),
        "total_ttc": round(total_ttc, 2),
        "category": invoice.category,
        "status": invoice.status,
        "reference": invoice.reference,
        "created_at": now.isoformat(),
        "created_by": user["name"],
        "updated_at": now.isoformat()
    }
    
    result = await db.invoices.insert_one(inv_dict)
    inv_dict.pop("_id", None)
    return {"id": str(result.inserted_id), **inv_dict}

@api_router.put("/invoices/purchases/{invoice_id}")
async def update_purchase_invoice(invoice_id: str, update: PurchaseInvoiceUpdate, user: dict = Depends(require_role(["admin"]))):
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one({"_id": ObjectId(invoice_id)}, {"$set": update_data})
    return {"message": "Facture achat mise à jour"}

@api_router.delete("/invoices/purchases/{invoice_id}")
async def delete_purchase_invoice(invoice_id: str, user: dict = Depends(require_role(["admin"]))):
    await db.invoices.delete_one({"_id": ObjectId(invoice_id)})
    return {"message": "Facture achat supprimée"}

# Import invoices (CSV + PDF)
@api_router.post("/invoices/import-csv")
async def import_invoices_csv(file: UploadFile = File(...), invoice_type: str = "purchase", user: dict = Depends(require_role(["admin"]))):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    
    imported = 0
    now = datetime.now(timezone.utc)
    
    for row in reader:
        try:
            if invoice_type == "purchase":
                number = await _get_next_invoice_number("FAA", now.year)
                amount_ht = float((row.get("Montant HT") or row.get("montant_ht") or row.get("HT") or "0").replace(",", ".").strip())
                tva_rate = float((row.get("TVA") or row.get("tva") or "20").replace(",", ".").replace("%", "").strip())
                
                inv = {
                    "type": "purchase",
                    "number": number,
                    "date": (row.get("Date") or row.get("date") or now.strftime("%Y-%m-%d")).strip(),
                    "supplier": (row.get("Fournisseur") or row.get("supplier") or "").strip(),
                    "description": (row.get("Description") or row.get("description") or "").strip(),
                    "amount_ht": amount_ht,
                    "tva_rate": tva_rate,
                    "total_tva": round(amount_ht * tva_rate / 100, 2),
                    "total_ttc": round(amount_ht * (1 + tva_rate / 100), 2),
                    "category": (row.get("Catégorie") or row.get("category") or "other").strip(),
                    "status": "importee",
                    "reference": (row.get("Référence") or row.get("reference") or "").strip(),
                    "created_at": now.isoformat(),
                    "created_by": user["name"],
                    "updated_at": now.isoformat()
                }
            else:
                number = await _get_next_invoice_number("FA", now.year)
                total_ht = float((row.get("Montant HT") or row.get("HT") or "0").replace(",", ".").strip())
                tva_rate = float((row.get("TVA") or "20").replace(",", ".").replace("%", "").strip())
                
                inv = {
                    "type": "sales",
                    "number": number,
                    "date": (row.get("Date") or now.strftime("%Y-%m-%d")).strip(),
                    "customer_name": (row.get("Client") or row.get("customer") or "").strip(),
                    "customer_email": "",
                    "customer_address": "",
                    "items": [{"description": (row.get("Description") or "Importé").strip(), "quantity": 1, "unit_price_ht": total_ht, "tva_rate": tva_rate}],
                    "total_ht": total_ht,
                    "tva_rate": tva_rate,
                    "total_tva": round(total_ht * tva_rate / 100, 2),
                    "total_ttc": round(total_ht * (1 + tva_rate / 100), 2),
                    "status": "importee",
                    "notes": "",
                    "created_at": now.isoformat(),
                    "created_by": user["name"],
                    "updated_at": now.isoformat()
                }
            
            await db.invoices.insert_one(inv)
            imported += 1
        except Exception as e:
            logging.error(f"Import error: {e}")
    
    return {"imported": imported}

@api_router.post("/invoices/import-pdf")
async def import_invoice_pdf(file: UploadFile = File(...), user: dict = Depends(require_role(["admin"]))):
    """Extract invoice data from PDF using AI"""
    content = await file.read()
    
    # Convert PDF to text
    import subprocess
    import tempfile
    
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        result = subprocess.run(["pdftotext", "-layout", tmp_path, "-"], capture_output=True, text=True, timeout=15)
        pdf_text = result.stdout[:3000] if result.returncode == 0 else ""
    except Exception:
        pdf_text = ""
    finally:
        os.unlink(tmp_path)
    
    if not pdf_text.strip():
        raise HTTPException(status_code=400, detail="Impossible de lire le PDF. Vérifiez le fichier.")
    
    # Use AI to extract invoice data
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Clé API LLM non configurée")
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"invoice-extract-{datetime.now().timestamp()}",
        system_message="""Tu es un assistant d'extraction de données de factures. Extrais les informations de la facture et retourne UNIQUEMENT un JSON valide avec ces champs:
{"supplier": "nom fournisseur", "date": "YYYY-MM-DD", "amount_ht": 0.00, "tva_rate": 20.0, "total_ttc": 0.00, "description": "description courte", "reference": "ref facture"}
Si un champ est introuvable, utilise une valeur par défaut. Retourne UNIQUEMENT le JSON, sans texte autour."""
    ).with_model("openai", "gpt-5.2")
    
    user_message = UserMessage(text=f"Extrais les données de cette facture:\n\n{pdf_text}")
    ai_response = await chat.send_message(user_message)
    
    # Parse AI response
    try:
        # Clean response - find JSON
        json_str = ai_response.strip()
        if "```" in json_str:
            json_str = json_str.split("```")[1].replace("json", "").strip()
        extracted = json.loads(json_str)
    except Exception:
        return {"extracted": None, "raw_text": pdf_text[:500], "error": "Extraction IA échouée. Vérifiez manuellement."}
    
    # Create the invoice
    now = datetime.now(timezone.utc)
    number = await _get_next_invoice_number("FAA", now.year)
    amount_ht = float(extracted.get("amount_ht", 0))
    tva_rate = float(extracted.get("tva_rate", 20))
    
    inv = {
        "type": "purchase",
        "number": number,
        "date": extracted.get("date", now.strftime("%Y-%m-%d")),
        "supplier": extracted.get("supplier", "Inconnu"),
        "description": extracted.get("description", "Facture importée PDF"),
        "amount_ht": round(amount_ht, 2),
        "tva_rate": tva_rate,
        "total_tva": round(amount_ht * tva_rate / 100, 2),
        "total_ttc": round(float(extracted.get("total_ttc", amount_ht * (1 + tva_rate / 100))), 2),
        "category": "other",
        "status": "importee",
        "reference": extracted.get("reference", ""),
        "created_at": now.isoformat(),
        "created_by": user["name"],
        "updated_at": now.isoformat()
    }
    
    result = await db.invoices.insert_one(inv)
    inv.pop("_id", None)
    return {"id": str(result.inserted_id), "extracted": extracted, **inv}

# ========= Comptable Management =========
@api_router.get("/admin/comptable")
async def get_comptable_account(user: dict = Depends(require_role(["admin"]))):
    comptable = await db.users.find_one({"role": "comptable"}, {"password_hash": 0})
    if not comptable:
        return None
    return {"id": str(comptable["_id"]), **{k:v for k,v in comptable.items() if k != "_id"}}

@api_router.put("/admin/comptable")
async def update_comptable_account(update: ComptableAccountUpdate, user: dict = Depends(require_role(["admin"]))):
    comptable = await db.users.find_one({"role": "comptable"})
    if not comptable:
        raise HTTPException(status_code=404, detail="Compte comptable non trouvé")
    
    update_data = {}
    if update.email:
        update_data["email"] = update.email.lower()
    if update.name:
        update_data["name"] = update.name
    if update.password:
        update_data["password_hash"] = hash_password(update.password)
    
    if update_data:
        await db.users.update_one({"_id": comptable["_id"]}, {"$set": update_data})
    
    return {"message": "Compte comptable mis à jour"}

# Comptable export - all financial data
@api_router.get("/comptable/export")
async def comptable_export(month: str, user: dict = Depends(require_role(["admin", "comptable"]))):
    import pandas as pd
    
    # Sales invoices
    sales = await db.invoices.find({"type": "sales", "date": {"$regex": f"^{month}"}}).to_list(1000)
    # Purchase invoices
    purchases = await db.invoices.find({"type": "purchase", "date": {"$regex": f"^{month}"}}).to_list(1000)
    # Bank transactions (matched only)
    bank_txns = await db.bank_transactions.find({"date": {"$regex": f"^{month}"}, "match_status": "matched"}).to_list(1000)
    
    status_map = {"draft": "Brouillon", "sent": "Envoyée", "paid": "Payée", "unpaid": "Impayée", "to_pay": "À payer", "importee": "Importée"}
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # All transactions combined
        all_rows = []
        for s in sales:
            all_rows.append({"Date": s.get("date", ""), "Type": "Vente", "N° Facture": s.get("number", ""), "Description": s.get("customer_name", ""), "HT": s.get("total_ht", 0), "TVA": s.get("total_tva", 0), "TTC": s.get("total_ttc", 0), "Statut": status_map.get(s.get("status", ""), s.get("status", ""))})
        for p in purchases:
            all_rows.append({"Date": p.get("date", ""), "Type": "Achat", "N° Facture": p.get("number", ""), "Description": f"{p.get('supplier', '')} - {p.get('description', '')}", "HT": p.get("amount_ht", 0), "TVA": p.get("total_tva", 0), "TTC": p.get("total_ttc", 0), "Statut": status_map.get(p.get("status", ""), p.get("status", ""))})
        
        if all_rows:
            pd.DataFrame(all_rows).to_excel(writer, sheet_name="Toutes factures", index=False)
        
        # Sales only
        if sales:
            sales_data = [{"Date": s.get("date", ""), "N° Facture": s.get("number", ""), "Client": s.get("customer_name", ""), "HT": s.get("total_ht", 0), "TVA": s.get("total_tva", 0), "TTC": s.get("total_ttc", 0), "Statut": status_map.get(s.get("status", ""), "")} for s in sales]
            pd.DataFrame(sales_data).to_excel(writer, sheet_name="Factures ventes", index=False)
        
        # Purchases only
        if purchases:
            purch_data = [{"Date": p.get("date", ""), "N° Facture": p.get("number", ""), "Fournisseur": p.get("supplier", ""), "Description": p.get("description", ""), "HT": p.get("amount_ht", 0), "TVA": p.get("total_tva", 0), "TTC": p.get("total_ttc", 0), "Catégorie": p.get("category", ""), "Statut": status_map.get(p.get("status", ""), "")} for p in purchases]
            pd.DataFrame(purch_data).to_excel(writer, sheet_name="Factures achats", index=False)
        
        # Bank reconciliation
        if bank_txns:
            bank_data = [{"Date": t.get("date", ""), "Description": t.get("description", ""), "Type": t.get("transaction_type", ""), "Montant": t.get("amount", 0), "Référence": t.get("reference", ""), "Rapprochement": t.get("match_type", "")} for t in bank_txns]
            pd.DataFrame(bank_data).to_excel(writer, sheet_name="Rapprochement bancaire", index=False)
        
        # Summary
        total_sales = sum(s.get("total_ttc", 0) for s in sales)
        total_purchases = sum(p.get("total_ttc", 0) for p in purchases)
        summary = [{"Mois": month, "Total ventes TTC": total_sales, "Total achats TTC": total_purchases, "Solde": total_sales - total_purchases}]
        pd.DataFrame(summary).to_excel(writer, sheet_name="Résumé", index=False)
    
    output.seek(0)
    return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=comptabilite_complete_{month}.xlsx"})

# Bank Reconciliation - Advanced (updated with lock)
@api_router.get("/accounting/bank-transactions")
async def get_bank_transactions(month: Optional[str] = None, status: Optional[str] = None, user: dict = Depends(require_role(["admin", "comptable"]))):
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
    # Check if locked
    txn = await db.bank_transactions.find_one({"_id": ObjectId(txn_id)})
    if txn and txn.get("locked"):
        raise HTTPException(status_code=400, detail="Cette transaction est verrouillée (rapprochement validé)")
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
    txn = await db.bank_transactions.find_one({"_id": ObjectId(txn_id)})
    if txn and txn.get("locked"):
        raise HTTPException(status_code=400, detail="Cette transaction est verrouillée")
    await db.bank_transactions.delete_one({"_id": ObjectId(txn_id)})
    return {"message": "Transaction supprimée"}

@api_router.post("/accounting/bank-transactions/lock")
async def lock_bank_transactions(month: str, user: dict = Depends(require_role(["admin"]))):
    """Validate and lock all matched transactions for a month"""
    result = await db.bank_transactions.update_many(
        {"date": {"$regex": f"^{month}"}, "match_status": "matched"},
        {"$set": {"locked": True, "locked_at": datetime.now(timezone.utc).isoformat(), "locked_by": user["name"]}}
    )
    return {"message": f"{result.modified_count} transactions verrouillées"}

@api_router.get("/accounting/reconciliation-summary")
async def get_reconciliation_summary(month: str, user: dict = Depends(require_role(["admin", "comptable"]))):
    bank_txns = await db.bank_transactions.find({"date": {"$regex": f"^{month}"}}).to_list(1000)
    
    total_bank_credits = sum(t["amount"] for t in bank_txns if t["transaction_type"] == "credit")
    total_bank_debits = sum(t["amount"] for t in bank_txns if t["transaction_type"] == "debit")
    matched_count = sum(1 for t in bank_txns if t.get("match_status") == "matched")
    unmatched_count = sum(1 for t in bank_txns if t.get("match_status") != "matched")
    locked_count = sum(1 for t in bank_txns if t.get("locked"))
    
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
        "locked": locked_count,
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

# ========= EDITORIAL CALENDAR + CAMPAIGNS + AGENDA =========

# Editorial Calendar
@api_router.get("/editorial/events")
async def get_editorial_events(month: Optional[str] = None, user: dict = Depends(require_role(["marketing", "admin"]))):
    query = {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    events = await db.editorial_events.find(query).sort("date", 1).to_list(500)
    return [{"id": str(e["_id"]), **{k:v for k,v in e.items() if k != "_id"}} for e in events]

@api_router.post("/editorial/events")
async def create_editorial_event(data: dict, user: dict = Depends(require_role(["marketing", "admin"]))):
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["created_by"] = user["name"]
    result = await db.editorial_events.insert_one(data)
    data.pop("_id", None)
    return {"id": str(result.inserted_id), **data}

@api_router.put("/editorial/events/{event_id}")
async def update_editorial_event(event_id: str, data: dict, user: dict = Depends(require_role(["marketing", "admin"]))):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.editorial_events.update_one({"_id": ObjectId(event_id)}, {"$set": data})
    return {"message": "Événement mis à jour"}

@api_router.delete("/editorial/events/{event_id}")
async def delete_editorial_event(event_id: str, user: dict = Depends(require_role(["marketing", "admin"]))):
    await db.editorial_events.delete_one({"_id": ObjectId(event_id)})
    return {"message": "Événement supprimé"}

# Marketing Campaigns
@api_router.get("/campaigns")
async def get_campaigns(user: dict = Depends(require_role(["marketing", "admin"]))):
    campaigns = await db.campaigns.find({}).sort("start_date", -1).to_list(500)
    return [{"id": str(c["_id"]), **{k:v for k,v in c.items() if k != "_id"}} for c in campaigns]

@api_router.post("/campaigns")
async def create_campaign(data: dict, user: dict = Depends(require_role(["marketing", "admin"]))):
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["created_by"] = user["name"]
    data.setdefault("networks", {})
    data.setdefault("objective", "notoriete")
    data.setdefault("notes", "")
    data.setdefault("files", [])
    result = await db.campaigns.insert_one(data)
    data.pop("_id", None)
    return {"id": str(result.inserted_id), **data}

@api_router.put("/campaigns/{campaign_id}")
async def update_campaign(campaign_id: str, data: dict, user: dict = Depends(require_role(["marketing", "admin"]))):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.campaigns.update_one({"_id": ObjectId(campaign_id)}, {"$set": data})
    return {"message": "Campagne mise à jour"}

@api_router.delete("/campaigns/{campaign_id}")
async def delete_campaign(campaign_id: str, user: dict = Depends(require_role(["marketing", "admin"]))):
    await db.campaigns.delete_one({"_id": ObjectId(campaign_id)})
    return {"message": "Campagne supprimée"}

# Agenda
@api_router.get("/agenda/events")
async def get_agenda_events(month: Optional[str] = None, user: dict = Depends(require_role(["admin"]))):
    query = {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    events = await db.agenda_events.find(query).sort("date", 1).to_list(500)
    return [{"id": str(e["_id"]), **{k:v for k,v in e.items() if k != "_id"}} for e in events]

@api_router.post("/agenda/events")
async def create_agenda_event(data: dict, user: dict = Depends(require_role(["admin"]))):
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    data["created_by"] = user["name"]
    data["synced_to_gcal"] = False
    result = await db.agenda_events.insert_one(data)
    data.pop("_id", None)
    return {"id": str(result.inserted_id), **data}

@api_router.put("/agenda/events/{event_id}")
async def update_agenda_event(event_id: str, data: dict, user: dict = Depends(require_role(["admin"]))):
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.agenda_events.update_one({"_id": ObjectId(event_id)}, {"$set": data})
    return {"message": "Événement mis à jour"}

@api_router.delete("/agenda/events/{event_id}")
async def delete_agenda_event(event_id: str, user: dict = Depends(require_role(["admin"]))):
    await db.agenda_events.delete_one({"_id": ObjectId(event_id)})
    return {"message": "Événement supprimé"}

@api_router.post("/agenda/events/{event_id}/sync-gcal")
async def sync_to_gcal(event_id: str, user: dict = Depends(require_role(["admin"]))):
    """Simulated Google Calendar sync"""
    await db.agenda_events.update_one({"_id": ObjectId(event_id)}, {"$set": {"synced_to_gcal": True, "gcal_synced_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Synchronisé vers Google Agenda (simulé)", "simulated": True}

# Google Calendar config
@api_router.get("/settings/google-calendar")
async def get_gcal_config(user: dict = Depends(require_role(["admin"]))):
    config = await db.settings.find_one({"type": "google_calendar"}, {"_id": 0})
    return config or {"calendar_id": "", "connected": False}

@api_router.post("/settings/google-calendar")
async def save_gcal_config(data: dict, user: dict = Depends(require_role(["admin"]))):
    data["type"] = "google_calendar"
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one({"type": "google_calendar"}, {"$set": data}, upsert=True)
    return {"message": "Configuration Google Agenda sauvegardée"}

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
        {"email": os.environ.get("MARKETING_EMAIL", "marketing@assault58.com"), "password": os.environ.get("MARKETING_PASSWORD", "Marketing58!Pro"), "name": "Marketing Assault58", "role": "marketing"},
        {"email": os.environ.get("COMPTABLE_EMAIL", "comptable@assault58.com"), "password": os.environ.get("COMPTABLE_PASSWORD", "Comptable58!Pro"), "name": "Comptable", "role": "comptable"}
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
        {"name": "Assault58 Pro X1000", "sku": "A58-PX1000", "description": "Lampe torche tactique 1000 lumens, étanche IP68", "price": 89.90, "quantity": 45, "alert_threshold": 10, "category": "lampe_torche", "weight": 0.35, "length": 18, "width": 4, "height": 4, "stock_location": "leac"},
        {"name": "Assault58 Ultra X2000", "sku": "A58-UX2000", "description": "Lampe torche tactique 2000 lumens, rechargeable USB-C", "price": 129.90, "quantity": 28, "alert_threshold": 8, "category": "lampe_torche", "weight": 0.42, "length": 21, "width": 4.5, "height": 4.5, "stock_location": "leac"},
        {"name": "Assault58 Compact C500", "sku": "A58-CC500", "description": "Lampe de poche compacte 500 lumens, EDC", "price": 49.90, "quantity": 67, "alert_threshold": 15, "category": "lampe_torche", "weight": 0.12, "length": 10, "width": 2.5, "height": 2.5, "stock_location": "andre"},
        {"name": "Assault58 Tactical T1500", "sku": "A58-TT1500", "description": "Lampe tactique professionnelle 1500 lumens, strobe", "price": 159.90, "quantity": 5, "alert_threshold": 10, "category": "lampe_torche", "weight": 0.55, "length": 22, "width": 5, "height": 5, "stock_location": "leac"},
        {"name": "Assault58 Mini M300", "sku": "A58-MM300", "description": "Mini lampe porte-clés 300 lumens", "price": 29.90, "quantity": 120, "alert_threshold": 20, "category": "lampe_torche", "weight": 0.05, "length": 6, "width": 2, "height": 2, "stock_location": "andre"},
        {"name": "Holster tactique universel", "sku": "A58-HT01", "description": "Holster ceinture compatible toutes lampes Assault58", "price": 19.90, "quantity": 80, "alert_threshold": 15, "category": "accessoire", "weight": 0.08, "length": 15, "width": 5, "height": 3, "stock_location": "leac"},
        {"name": "Kit filtres couleur", "sku": "A58-KF01", "description": "Jeu de 4 filtres (rouge, vert, bleu, diffuseur)", "price": 14.90, "quantity": 45, "alert_threshold": 10, "category": "accessoire", "weight": 0.03, "length": 5, "width": 5, "height": 2, "stock_location": "andre"},
    ]
    
    for product in demo_products:
        existing = await db.products.find_one({"sku": product["sku"]})
        if not existing:
            product["created_at"] = datetime.now(timezone.utc).isoformat()
            product["updated_at"] = datetime.now(timezone.utc).isoformat()
            product["photo_url"] = ""
            await db.products.insert_one(product)
            logger.info(f"Product created: {product['name']}")
    
    # Seed demo customers (with coordinates for map)
    demo_customers = [
        {"name": "Jean Dupont", "email": "jean.dupont@email.com", "phone": "06 12 34 56 78", "address": "15 Rue de la Paix, 75001 Paris", "status": "particulier", "latitude": 48.8698, "longitude": 2.3311},
        {"name": "Marie Martin", "email": "marie.martin@email.com", "phone": "06 98 76 54 32", "address": "8 Avenue des Champs-Élysées, 75008 Paris", "status": "particulier", "latitude": 48.8698, "longitude": 2.3077},
        {"name": "Pierre Bernard", "email": "p.bernard@email.com", "phone": "07 11 22 33 44", "address": "23 Rue du Commerce, 69001 Lyon", "status": "professionnel", "latitude": 45.7640, "longitude": 4.8357},
        {"name": "Groupement Gendarmerie Nationale", "email": "contact@gendarmerie-achat.fr", "phone": "01 56 28 40 00", "address": "4 Rue Claude Bernard, 92130 Issy-les-Moulineaux", "status": "gendarmerie", "latitude": 48.8244, "longitude": 2.2697},
        {"name": "Commissariat Central Marseille", "email": "achat@police-marseille.fr", "phone": "04 91 39 80 00", "address": "2 Rue Antoine Becker, 13002 Marseille", "status": "police", "latitude": 43.3004, "longitude": 5.3698},
        {"name": "ENSP Saint-Cyr-au-Mont-d'Or", "email": "logistique@ensp.interieur.gouv.fr", "phone": "04 72 53 18 00", "address": "9 Rue Carnot, 69450 Saint-Cyr-au-Mont-d'Or", "status": "ecole_police", "latitude": 45.8131, "longitude": 4.8283},
        {"name": "Fédération de Chasse du Lot", "email": "fed.chasse46@chasseurdefrance.com", "phone": "05 65 35 09 50", "address": "96 Rue du Docteur Bergougnoux, 46000 Cahors", "status": "federation_chasse", "latitude": 44.4475, "longitude": 1.4369},
        {"name": "Outdoor Pro Toulouse", "email": "pro@outdoor-toulouse.com", "phone": "05 61 22 33 44", "address": "12 Allées Jean Jaurès, 31000 Toulouse", "status": "professionnel", "latitude": 43.6047, "longitude": 1.4442},
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
    
    # Seed stock movements (10 movements, 3 gift/prospection)
    existing_movements = await db.stock_movements.count_documents({})
    if existing_movements < 3 and products:
        movements = [
            {"product_id": str(products[0]["_id"]), "product_name": products[0]["name"], "quantity_change": 50, "previous_quantity": 45, "new_quantity": 95, "reason": "Réception fournisseur", "movement_type": "normal"},
            {"product_id": str(products[1]["_id"]), "product_name": products[1]["name"], "quantity_change": -2, "previous_quantity": 28, "new_quantity": 26, "reason": "Commande WOO-1234", "movement_type": "normal"},
            {"product_id": str(products[2]["_id"]), "product_name": products[2]["name"], "quantity_change": 30, "previous_quantity": 67, "new_quantity": 97, "reason": "Réassort trimestriel", "movement_type": "normal"},
            {"product_id": str(products[3]["_id"]), "product_name": products[3]["name"], "quantity_change": -1, "previous_quantity": 5, "new_quantity": 4, "reason": "Vente salon Milipol", "movement_type": "normal"},
            {"product_id": str(products[0]["_id"]), "product_name": products[0]["name"], "quantity_change": -3, "previous_quantity": 95, "new_quantity": 92, "reason": "Commande groupée gendarmerie", "movement_type": "normal"},
            {"product_id": str(products[4]["_id"]), "product_name": products[4]["name"], "quantity_change": -5, "previous_quantity": 120, "new_quantity": 115, "reason": "Inventaire correction", "movement_type": "normal"},
            {"product_id": str(products[1]["_id"]), "product_name": products[1]["name"], "quantity_change": 20, "previous_quantity": 26, "new_quantity": 46, "reason": "Livraison usine", "movement_type": "normal"},
            {"product_id": str(products[0]["_id"]), "product_name": products[0]["name"], "quantity_change": -2, "previous_quantity": 92, "new_quantity": 90, "reason": "Cadeau salon Milipol - prospect Gendarmerie", "movement_type": "gift_prospection"},
            {"product_id": str(products[2]["_id"]), "product_name": products[2]["name"], "quantity_change": -1, "previous_quantity": 97, "new_quantity": 96, "reason": "Échantillon YouTubeur Survival Gear France", "movement_type": "gift_prospection"},
            {"product_id": str(products[4]["_id"]), "product_name": products[4]["name"], "quantity_change": -3, "previous_quantity": 115, "new_quantity": 112, "reason": "Lots cadeaux clients fidèles Noël", "movement_type": "gift_prospection"},
        ]
        for i, m in enumerate(movements):
            m["user_id"] = "system"
            m["user_name"] = "Système"
            m["created_at"] = (datetime.now(timezone.utc) - timedelta(days=10-i)).isoformat()
            await db.stock_movements.insert_one(m)
        logger.info("Stock movements seeded")
    
    # Seed editorial calendar with French commercial events 2026
    existing_ed = await db.editorial_events.count_documents({})
    if existing_ed == 0:
        editorial_events = [
            {"date": "2026-01-01", "title": "Nouvel An", "type": "commercial", "platform": "all", "content": "Bonne année ! Découvrez nos offres de rentrée", "status": "published", "auto": True},
            {"date": "2026-01-08", "title": "Soldes d'hiver", "type": "promo", "platform": "all", "content": "Soldes d'hiver Assault58 - jusqu'à -30%", "status": "published", "auto": True},
            {"date": "2026-02-14", "title": "Saint-Valentin", "type": "commercial", "platform": "instagram", "content": "Offrez une lampe tactique à votre partenaire d'aventure", "status": "draft", "auto": True},
            {"date": "2026-03-08", "title": "Journée de la femme", "type": "commercial", "platform": "instagram", "content": "L'aventure n'a pas de genre - Assault58", "status": "draft", "auto": True},
            {"date": "2026-04-20", "title": "Lancement T1500 V2", "type": "lancement", "platform": "all", "content": "Nouveau ! Assault58 Tactical T1500 V2 - encore plus puissante", "status": "draft", "auto": False},
            {"date": "2026-05-01", "title": "Fête du travail", "type": "commercial", "platform": "facebook", "content": "", "status": "draft", "auto": True},
            {"date": "2026-06-24", "title": "Soldes d'été", "type": "promo", "platform": "all", "content": "Soldes d'été - équipez-vous pour vos aventures", "status": "draft", "auto": True},
            {"date": "2026-06-21", "title": "Fête des pères", "type": "commercial", "platform": "all", "content": "Le cadeau parfait pour papa aventurier", "status": "draft", "auto": True},
            {"date": "2026-09-15", "title": "Salon Milipol", "type": "salon", "platform": "all", "content": "Retrouvez-nous au Salon Milipol - Stand B42", "status": "draft", "auto": False},
            {"date": "2026-11-27", "title": "Black Friday", "type": "promo", "platform": "all", "content": "Black Friday Assault58 - offres exceptionnelles", "status": "draft", "auto": True},
            {"date": "2026-12-01", "title": "Calendrier de l'Avent", "type": "promo", "platform": "instagram", "content": "24 jours, 24 surprises !", "status": "draft", "auto": True},
            {"date": "2026-12-25", "title": "Noël", "type": "commercial", "platform": "all", "content": "Joyeux Noël ! L'aventure commence sous le sapin", "status": "draft", "auto": True},
        ]
        for ev in editorial_events:
            ev["created_at"] = datetime.now(timezone.utc).isoformat()
            ev["created_by"] = "Système"
            await db.editorial_events.insert_one(ev)
        logger.info("Editorial events seeded")
    
    # Seed campaigns
    existing_camp = await db.campaigns.count_documents({})
    if existing_camp == 0:
        campaigns = [
            {"name": "Lancement Ultra X2000", "status": "completed", "objective": "ventes", "start_date": "2026-03-01", "end_date": "2026-03-31", "notes": "Campagne de lancement multi-canal pour le nouveau X2000", "color": "#3B82F6", "files": [],
             "networks": {
                 "facebook": {"enabled": True, "budget_planned": 300, "budget_spent": 265, "content_type": "video", "results": {"reach": 32000, "clicks": 890, "impressions": 52000}},
                 "instagram": {"enabled": True, "budget_planned": 200, "budget_spent": 158.50, "content_type": "carousel", "results": {"reach": 13200, "clicks": 340, "impressions": 21000}},
             }},
            {"name": "Promo Printemps", "status": "active", "objective": "trafic", "start_date": "2026-04-01", "end_date": "2026-04-30", "notes": "Offres de printemps sur toute la gamme", "color": "#F59E0B", "files": [],
             "networks": {
                 "instagram": {"enabled": True, "budget_planned": 200, "budget_spent": 112.20, "content_type": "reel", "results": {"reach": 15600, "clicks": 620, "impressions": 28000}},
                 "tiktok": {"enabled": True, "budget_planned": 150, "budget_spent": 75, "content_type": "video", "results": {"reach": 7200, "clicks": 256, "impressions": 14500}},
             }},
            {"name": "Notoriété YouTube Q2", "status": "planned", "objective": "notoriete", "start_date": "2026-05-01", "end_date": "2026-06-30", "notes": "Série de vidéos tests avec influenceurs outdoor", "color": "#EF4444", "files": [],
             "networks": {
                 "youtube": {"enabled": True, "budget_planned": 500, "budget_spent": 0, "content_type": "video", "results": {"reach": 0, "clicks": 0, "impressions": 0}},
                 "instagram": {"enabled": True, "budget_planned": 100, "budget_spent": 0, "content_type": "story", "results": {"reach": 0, "clicks": 0, "impressions": 0}},
             }},
        ]
        for c in campaigns:
            c["created_at"] = datetime.now(timezone.utc).isoformat()
            c["created_by"] = "Système"
            await db.campaigns.insert_one(c)
        logger.info("Campaigns seeded")
    
    # Seed agenda events
    existing_agenda = await db.agenda_events.count_documents({})
    if existing_agenda == 0:
        agenda_events = [
            {"date": "2026-04-25", "time": "09:00", "title": "Réunion fournisseur LED", "type": "reunion", "description": "Négociation prix composants Q3", "location": "Bureau Paris", "synced_to_gcal": False},
            {"date": "2026-05-10", "time": "10:00", "title": "Shooting photo produits", "type": "marketing", "description": "Photos gamme 2026 pour site et réseaux", "location": "Studio Photo Lyon", "synced_to_gcal": False},
            {"date": "2026-06-15", "time": "08:00", "title": "Salon Eurosatory", "type": "salon", "description": "Salon international de défense - Stand prévu", "location": "Paris Nord Villepinte", "synced_to_gcal": False},
            {"date": "2026-09-15", "time": "08:00", "title": "Salon Milipol", "type": "salon", "description": "Salon mondial de la sûreté intérieure", "location": "Paris Nord Villepinte", "synced_to_gcal": False},
            {"date": "2026-11-20", "time": "14:00", "title": "Préparation Black Friday", "type": "promo", "description": "Finalisation offres et visuels BF", "location": "Bureau", "synced_to_gcal": False},
        ]
        for ev in agenda_events:
            ev["created_at"] = datetime.now(timezone.utc).isoformat()
            ev["created_by"] = "Système"
            await db.agenda_events.insert_one(ev)
        logger.info("Agenda events seeded")
    
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
        f.write("## Comptable Account\n")
        f.write(f"- Email: {os.environ.get('COMPTABLE_EMAIL', 'comptable@assault58.com')}\n")
        f.write(f"- Password: {os.environ.get('COMPTABLE_PASSWORD', 'Comptable58!Pro')}\n")
        f.write("- Role: comptable\n\n")
        f.write("## Auth Endpoints\n")
        f.write("- POST /api/auth/login\n")
        f.write("- POST /api/auth/logout\n")
        f.write("- GET /api/auth/me\n")
    
    logger.info("Startup complete - users and demo data seeded")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
