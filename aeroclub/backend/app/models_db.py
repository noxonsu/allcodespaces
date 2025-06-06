from typing import TypedDict, List, Optional
import uuid
from datetime import datetime

# Using TypedDict for data that will be directly stored/retrieved from JSON
# These are not Pydantic models, but rather type hints for dictionary structures.

class UserInDB(TypedDict):
    id: str  # UUID stored as string in JSON
    login: str
    hashed_password: str

class LocationInDB(TypedDict):
    id: str  # UUID stored as string
    numeric_id: int
    address: str
    qr_code_link: str

class MenuItemInDB(TypedDict):
    id: str  # UUID stored as string
    name: str
    image_filename: Optional[str]
    price: float

class LocationMenuAssociationInDB(TypedDict):
    location_id: str  # UUID stored as string
    menu_item_id: str # UUID stored as string

class MainDB(TypedDict):
    users: List[UserInDB]
    locations: List[LocationInDB]
    menu_items: List[MenuItemInDB]
    location_menu_associations: List[LocationMenuAssociationInDB]

# For orders_db.json
class OrderItemInDB(TypedDict):
    menu_item_id: str # UUID stored as string
    name_snapshot: str
    quantity: int
    price_snapshot: float

class OrderInDB(TypedDict):
    id: str # UUID stored as string
    location_id: str # Can be UUID string or numeric_id (store as string for consistency if UUID)
    spot: Optional[str]
    telegram_user_id: Optional[str]
    items: List[OrderItemInDB]
    total_amount: float
    status: str 
    created_at: str  # ISO format string
    updated_at: str  # ISO format string

# orders_db.json is a list of OrderInDB
OrdersDB = List[OrderInDB]
