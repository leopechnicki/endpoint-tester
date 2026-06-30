"""
FastAPI sample application for endpoint-tester.

Run:  uvicorn app.main:app --reload --port 8000
Docs: http://localhost:8000/docs
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="endpoint-tester FastAPI Sample", version="1.0.0")

# ─── Pydantic models ───────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "viewer"

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None

class ProductCreate(BaseModel):
    name: str
    price: float
    category: str

class ProductPatch(BaseModel):
    price: Optional[float] = None
    category: Optional[str] = None

# ─── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health_check():
    return {"status": "ok"}

# ─── Users ─────────────────────────────────────────────────────────────────────

from fastapi import APIRouter

users_router = APIRouter(prefix="/api/users", tags=["users"])

@users_router.get("/")
def list_users(page: int = 1, limit: int = 20):
    return {"users": [], "page": page, "limit": limit}

@users_router.post("/", status_code=201)
def create_user(user: UserCreate):
    return {"id": 1, **user.model_dump()}

@users_router.get("/{user_id}")
def get_user(user_id: int):
    if user_id == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user_id, "name": "Alice", "email": "alice@example.com"}

@users_router.put("/{user_id}")
def update_user(user_id: int, user: UserUpdate):
    return {"id": user_id, **user.model_dump(exclude_none=True)}

@users_router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int):
    return None

@users_router.get("/{user_id}/orders")
def get_user_orders(user_id: int):
    return {"user_id": user_id, "orders": []}

# ─── Products ──────────────────────────────────────────────────────────────────

products_router = APIRouter(prefix="/api/products", tags=["products"])

@products_router.get("/")
def list_products():
    return {"products": []}

@products_router.post("/", status_code=201)
def create_product(product: ProductCreate):
    return {"id": 1, **product.model_dump()}

@products_router.get("/{product_id}")
def get_product(product_id: int):
    if product_id == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"id": product_id, "name": "Widget", "price": 9.99}

@products_router.patch("/{product_id}")
def patch_product(product_id: int, patch: ProductPatch):
    return {"id": product_id, **patch.model_dump(exclude_none=True)}

@products_router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int):
    return None

# ─── Mount routers ─────────────────────────────────────────────────────────────

app.include_router(users_router)
app.include_router(products_router)
