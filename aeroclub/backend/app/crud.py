import json
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Union

from . import models_db
from . import schemas
from .core.security import get_password_hash

# Define paths to JSON database files
# The db_json directory is now in the root of the 'aeroclub' project
DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'db_json')
MAIN_DB_PATH = os.path.join(DB_DIR, 'main_db.json')
ORDERS_DB_PATH = os.path.join(DB_DIR, 'orders_db.json')

# Ensure db_json directory exists
os.makedirs(DB_DIR, exist_ok=True)

# Helper function to read main_db.json
def read_main_db() -> models_db.MainDB:
    if not os.path.exists(MAIN_DB_PATH):
        # Create an empty DB if it doesn't exist
        initial_data: models_db.MainDB = {
            "users": [], 
            "locations": [], 
            "menu_items": [], 
            "location_menu_associations": []
        }
        with open(MAIN_DB_PATH, 'w') as f:
            json.dump(initial_data, f, indent=2)
        return initial_data
    try:
        with open(MAIN_DB_PATH, 'r') as f:
            data = json.load(f)
            # Basic validation for top-level keys
            if not all(key in data for key in ["users", "locations", "menu_items", "location_menu_associations"]):
                 raise ValueError("MainDB is missing one or more top-level keys.")
            return data
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error reading or parsing main_db.json: {e}")
        # Fallback to initial data if file is corrupted or malformed
        initial_data: models_db.MainDB = {
            "users": [], "locations": [], "menu_items": [], "location_menu_associations": []
        }
        return initial_data


# Helper function to write main_db.json
def write_main_db(db_data: models_db.MainDB):
    with open(MAIN_DB_PATH, 'w') as f:
        json.dump(db_data, f, indent=2)

# Helper function to read orders_db.json
def read_orders_db() -> models_db.OrdersDB:
    if not os.path.exists(ORDERS_DB_PATH):
        with open(ORDERS_DB_PATH, 'w') as f:
            json.dump([], f, indent=2) # Orders DB is a list
        return []
    try:
        with open(ORDERS_DB_PATH, 'r') as f:
            data = json.load(f)
            if not isinstance(data, list):
                raise ValueError("OrdersDB should be a list.")
            return data
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error reading or parsing orders_db.json: {e}")
        return [] # Fallback to empty list

# Helper function to write orders_db.json
def write_orders_db(db_data: models_db.OrdersDB):
    with open(ORDERS_DB_PATH, 'w') as f:
        json.dump(db_data, f, indent=2)

# --- User CRUD ---
def get_user_by_login(login: str) -> Optional[models_db.UserInDB]:
    db = read_main_db()
    for user in db["users"]:
        if user["login"] == login:
            return user
    return None

def create_user(user_in: schemas.UserCreate) -> models_db.UserInDB:
    db = read_main_db()
    hashed_password = get_password_hash(user_in.password)
    new_user_id = str(uuid.uuid4())
    
    # Ensure the first user created is the admin from .env
    # This is a simple way to initialize the admin user.
    # More robust solutions might involve a setup script or command.
    if not db["users"]: # If no users exist, this is the first one
        from .core.config import settings
        if user_in.login == settings.ADMIN_USERNAME:
             # Potentially update password if it was a default one in .env
             pass # The password from UserCreate is used.
        else:
            # This logic might need refinement depending on how admin creation is handled.
            # For now, we assume the first user created via API with matching ADMIN_USERNAME is the admin.
            pass


    new_user: models_db.UserInDB = {
        "id": new_user_id,
        "login": user_in.login,
        "hashed_password": hashed_password,
        "location_id": str(user_in.location_id) if user_in.location_id else None,
    }
    db["users"].append(new_user)
    write_main_db(db)
    return new_user

def get_users() -> List[Dict[str, Any]]: # Return type changed to support added fields
    db = read_main_db()
    users_with_locations = []
    for user_data in db["users"]:
        user_dict = dict(user_data) # Convert TypedDict to regular dict for modification
        location_name = None
        if user_data.get("location_id"):
            location = get_location_by_id(user_data["location_id"]) # type: ignore
            if location:
                location_name = location["address"]
        user_dict["location_name"] = location_name
        users_with_locations.append(user_dict)
    return users_with_locations

# --- Location CRUD ---
def get_locations() -> List[models_db.LocationInDB]:
    db = read_main_db()
    return db["locations"]

def get_location_by_id(location_id: str) -> Optional[models_db.LocationInDB]:
    db = read_main_db()
    for loc in db["locations"]:
        if loc["id"] == location_id:
            return loc
    return None

def get_location_by_numeric_id(numeric_id: int) -> Optional[models_db.LocationInDB]:
    db = read_main_db()
    for loc in db["locations"]:
        if loc["numeric_id"] == numeric_id:
            return loc
    return None

def get_next_numeric_id() -> int:
    db = read_main_db()
    if not db["locations"]:
        return 1001
    return max(loc["numeric_id"] for loc in db["locations"]) + 1

def create_location(location_in: schemas.LocationCreate) -> models_db.LocationInDB:
    db = read_main_db()
    new_id = str(uuid.uuid4())
    numeric_id = get_next_numeric_id()
    # TODO: Get bot name from config or hardcode for now
    qr_code_link = f"https://t.me/aeroclubappbot/?start={numeric_id}" # Placeholder bot name

    new_location: models_db.LocationInDB = {
        "id": new_id,
        "numeric_id": numeric_id,
        "address": location_in.address,
        "qr_code_link": qr_code_link,
    }
    db["locations"].append(new_location)
    write_main_db(db)
    return new_location

def update_location(location_id: str, location_in: schemas.LocationCreate) -> Optional[models_db.LocationInDB]:
    db = read_main_db()
    for i, loc in enumerate(db["locations"]):
        if loc["id"] == location_id:
            # Retain numeric_id and qr_code_link, only update address
            db["locations"][i]["address"] = location_in.address
            write_main_db(db)
            return db["locations"][i]
    return None

def delete_location(location_id: str) -> bool:
    db = read_main_db()
    original_len = len(db["locations"])
    db["locations"] = [loc for loc in db["locations"] if loc["id"] != location_id]
    # Also remove associations
    db["location_menu_associations"] = [
        assoc for assoc in db["location_menu_associations"] if assoc["location_id"] != location_id
    ]
    if len(db["locations"]) < original_len:
        write_main_db(db)
        return True
    return False

# --- MenuItem CRUD ---
def get_menu_items(location_id: Optional[str] = None) -> List[models_db.MenuItemInDB]:
    db = read_main_db()
    if location_id:
        associated_item_ids = {
            assoc["menu_item_id"] for assoc in db["location_menu_associations"] 
            if assoc["location_id"] == location_id
        }
        return [item for item in db["menu_items"] if item["id"] in associated_item_ids]
    return db["menu_items"]

def get_menu_item_by_id(item_id: str) -> Optional[models_db.MenuItemInDB]:
    db = read_main_db()
    for item in db["menu_items"]:
        if item["id"] == item_id:
            return item
    return None

def create_menu_item(item_in: schemas.MenuItemCreate) -> models_db.MenuItemInDB:
    db = read_main_db()
    new_id = str(uuid.uuid4())
    new_item: models_db.MenuItemInDB = {
        "id": new_id,
        "name": item_in.name,
        "image_filename": item_in.image_filename,
        "price": item_in.price,
    }
    db["menu_items"].append(new_item)
    write_main_db(db)
    return new_item

def update_menu_item(item_id: str, item_in: schemas.MenuItemUpdate) -> Optional[models_db.MenuItemInDB]:
    db = read_main_db()
    for i, item in enumerate(db["menu_items"]):
        if item["id"] == item_id:
            update_data = item_in.model_dump(exclude_unset=True) # Pydantic v2
            for key, value in update_data.items():
                if value is not None: # Ensure optional fields are only updated if provided
                    db["menu_items"][i][key] = value # type: ignore
            write_main_db(db)
            return db["menu_items"][i]
    return None

def delete_menu_item(item_id: str) -> bool:
    db = read_main_db()
    original_len = len(db["menu_items"])
    db["menu_items"] = [item for item in db["menu_items"] if item["id"] != item_id]
    # Also remove associations
    db["location_menu_associations"] = [
        assoc for assoc in db["location_menu_associations"] if assoc["menu_item_id"] != item_id
    ]
    if len(db["menu_items"]) < original_len:
        write_main_db(db)
        return True
    return False

# --- Location <-> MenuItem Association CRUD ---
def associate_item_to_location(location_id: str, item_id: str) -> bool:
    db = read_main_db()
    # Check if location and item exist
    if not get_location_by_id(location_id) or not get_menu_item_by_id(item_id):
        return False
    
    # Check if association already exists
    for assoc in db["location_menu_associations"]:
        if assoc["location_id"] == location_id and assoc["menu_item_id"] == item_id:
            return True # Already associated

    new_association: models_db.LocationMenuAssociationInDB = {
        "location_id": location_id,
        "menu_item_id": item_id,
    }
    db["location_menu_associations"].append(new_association)
    write_main_db(db)
    return True

def disassociate_item_from_location(location_id: str, item_id: str) -> bool:
    db = read_main_db()
    original_len = len(db["location_menu_associations"])
    db["location_menu_associations"] = [
        assoc for assoc in db["location_menu_associations"]
        if not (assoc["location_id"] == location_id and assoc["menu_item_id"] == item_id)
    ]
    if len(db["location_menu_associations"]) < original_len:
        write_main_db(db)
        return True
    return False

# --- Order CRUD ---
def get_orders(
    location_id: Optional[Union[str, int]] = None, 
    status: Optional[str] = None,
    telegram_user_id: Optional[str] = None
) -> List[models_db.OrderInDB]:
    db_orders = read_orders_db()
    filtered_orders = db_orders

    if location_id:
        # If location_id is int, it's a numeric_id, find the corresponding UUID
        loc_uuid_str = None
        if isinstance(location_id, int):
            loc = get_location_by_numeric_id(location_id)
            if loc:
                loc_uuid_str = loc["id"]
        else: # It's already a UUID string
            loc_uuid_str = location_id
        
        if loc_uuid_str:
            filtered_orders = [order for order in filtered_orders if order["location_id"] == loc_uuid_str]
        else: # If numeric_id not found, or invalid UUID string, return empty
            return []


    if status:
        filtered_orders = [order for order in filtered_orders if order["status"] == status]
    
    if telegram_user_id:
        filtered_orders = [order for order in filtered_orders if order.get("telegram_user_id") == telegram_user_id]
        
    return filtered_orders

def get_order_by_id(order_id: str) -> Optional[models_db.OrderInDB]:
    db_orders = read_orders_db()
    for order in db_orders:
        if order["id"] == order_id:
            return order
    return None

def create_order(order_in: schemas.OrderCreate) -> models_db.OrderInDB:
    db_orders = read_orders_db()
    new_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Resolve location_id: if it's numeric, convert to UUID string
    loc_id_str: str
    if isinstance(order_in.location_id, int):
        location = get_location_by_numeric_id(order_in.location_id)
        if not location:
            raise ValueError(f"Location with numeric_id {order_in.location_id} not found.")
        loc_id_str = location["id"]
    else: # It's a UUID
        # Ensure it's a string representation of UUID
        loc_id_str = str(order_in.location_id)
        if not get_location_by_id(loc_id_str): # Validate UUID exists
             raise ValueError(f"Location with id {loc_id_str} not found.")


    new_order: models_db.OrderInDB = {
        "id": new_id,
        "location_id": loc_id_str,
        "spot": order_in.spot,
        "telegram_user_id": order_in.telegram_user_id,
        "items": [
            # Explicitly convert UUID to string for JSON serialization
            {**item.model_dump(), "menu_item_id": str(item.menu_item_id)}
            for item in order_in.items
        ],
        "total_amount": order_in.total_amount,
        "status": order_in.status,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    db_orders.append(new_order)
    write_orders_db(db_orders)
    return new_order

def update_order_status(order_id: str, status: str) -> Optional[models_db.OrderInDB]:
    db_orders = read_orders_db()
    for i, order in enumerate(db_orders):
        if order["id"] == order_id:
            db_orders[i]["status"] = status
            db_orders[i]["updated_at"] = datetime.now(timezone.utc).isoformat()
            write_orders_db(db_orders)
            return db_orders[i]
    return None
