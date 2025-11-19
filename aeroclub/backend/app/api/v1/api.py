from fastapi import APIRouter

from app.api.v1.endpoints import auth, users, locations, menu_items, orders

api_router_v1 = APIRouter()

api_router_v1.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router_v1.include_router(users.router, prefix="/users", tags=["Users"])
api_router_v1.include_router(locations.router, prefix="/locations", tags=["Locations"])
api_router_v1.include_router(menu_items.router, prefix="/menu-items", tags=["Menu Items"])
api_router_v1.include_router(orders.router, prefix="/orders", tags=["Orders"])
