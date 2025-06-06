from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Union
import uuid
from datetime import datetime

# JWT Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Union[str, None] = None

# User Schemas
class UserBase(BaseModel):
    login: str

class UserCreate(UserBase):
    password: str

class UserInDBBase(UserBase):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    
    model_config = ConfigDict(from_attributes=True)

class User(UserInDBBase):
    pass

class UserInDB(UserInDBBase):
    hashed_password: str

# MenuItem Schemas
class MenuItemBase(BaseModel):
    name: str
    image_filename: Optional[str] = None
    price: float

class MenuItemCreate(MenuItemBase):
    pass

class MenuItemUpdate(MenuItemBase):
    name: Optional[str] = None
    image_filename: Optional[str] = None
    price: Optional[float] = None

class MenuItem(MenuItemBase):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)

    model_config = ConfigDict(from_attributes=True)

# Location Schemas
class LocationBase(BaseModel):
    address: str

class LocationCreate(LocationBase):
    pass

class Location(LocationBase):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    numeric_id: int
    qr_code_link: str

    model_config = ConfigDict(from_attributes=True)

# OrderItem Schemas
class OrderItemBase(BaseModel):
    menu_item_id: uuid.UUID
    name_snapshot: str
    quantity: int
    price_snapshot: float

class OrderItemCreate(OrderItemBase):
    pass

class OrderItem(OrderItemBase):
    model_config = ConfigDict(from_attributes=True)

# Order Schemas
class OrderBase(BaseModel):
    location_id: Union[uuid.UUID, int] # Can be UUID or numeric_id
    spot: Optional[str] = None
    telegram_user_id: Optional[str] = None
    items: List[OrderItemCreate]
    total_amount: float
    status: str = "pending"

class OrderCreate(OrderBase):
    pass

class Order(OrderBase):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    items: List[OrderItem] # Use the OrderItem schema here

    model_config = ConfigDict(from_attributes=True)
