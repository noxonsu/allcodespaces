# Aeroclub Backend Plan

## 1. Technologies:
*   **Language/Framework:** Python with FastAPI.
*   **Database:** JSON files (`main_db.json` for core data, `orders_db.json` for orders).
*   **Configuration:** `.env` file.
*   **Asynchronicity:** Leverage FastAPI's async capabilities.

## 2. Directory Structure:
```
backend/
├── app/                     # Main application code
│   ├── __init__.py
│   ├── main.py              # FastAPI app initialization, router connections
│   ├── crud.py              # Functions for JSON file I/O (CRUD)
│   ├── models_db.py         # Data models for JSON storage (e.g., TypedDict)
│   ├── schemas.py           # Pydantic models for API request/response validation
│   ├── core/                # Core settings and utilities
│   │   ├── __init__.py
│   │   ├── config.py        # Load .env variables
│   │   └── security.py      # Password hashing, JWT utilities
│   ├── api/                 # API endpoints
│   │   ├── __init__.py
│   │   └── v1/              # API versioning (start with v1)
│   │       ├── __init__.py
│   │       ├── endpoints/   # Endpoint modules
│   │       │   ├── __init__.py
│   │       │   ├── auth.py      # Login endpoint
│   │       │   ├── users.py
│   │       │   ├── locations.py # Including QR code link generation
│   │       │   ├── menu_items.py
│   │       │   └── orders.py
│   │       └── deps.py          # Endpoint dependencies (e.g., auth checks)
│   ├── db_json/             # Directory for JSON database files
│   │   ├── main_db.json     # For users, locations, menu items
│   │   └── orders_db.json   # For orders
│   └── services/            # Service layer for business logic
│       ├── __init__.py
│       └── telegram_bot.py  # Logic for Telegram Bot API interaction
├── .env                     # Environment variables file
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

## 3. `.env` File Structure:
```dotenv
ADMIN_USERNAME=your_admin_login
ADMIN_PASSWORD=your_admin_password # Store hash in production
TELEGRAM_BOT_TOKEN=7866367914:AAH3Ylj--9MvmS4NBWlD8bIOSLdyhW32XWY
SECRET_KEY=your_very_secret_jwt_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

## 4. JSON Database Structure:

### `app/db_json/main_db.json`:
```json
{
  "users": [
    // { "id": "user_uuid1", "login": "admin_login", "hashed_password": "hashed_admin_password" }
  ],
  "locations": [
    // { "id": "loc_uuid1", "numeric_id": 1001, "address": "Location Address 1", "qr_code_link": "https://t.me/aeroclubappbot/?start=1001" }
  ],
  "menu_items": [
    // { "id": "item_uuid1", "name": "Coffee", "image_filename": "coffee.png", "price": 150.00 }
  ],
  "location_menu_associations": [
    // { "location_id": "loc_uuid1", "menu_item_id": "item_uuid1" }
  ]
}
```
*   `id` fields should ideally be UUIDs.
*   `numeric_id` for locations is for QR codes.

### `app/db_json/orders_db.json`:
```json
[
  // {
  //   "id": "order_uuid1",
  //   "location_id": "loc_uuid1", // or numeric_id
  //   "spot": "Table 12",
  //   "telegram_user_id": "telegram_user_id_optional",
  //   "items": [
  //     { "menu_item_id": "item_uuid1", "name_snapshot": "Coffee", "quantity": 2, "price_snapshot": 150.00 }
  //   ],
  //   "total_amount": 300.00,
  //   "status": "pending", // e.g., pending, processing, completed, cancelled
  //   "created_at": "YYYY-MM-DDTHH:MM:SSZ",
  //   "updated_at": "YYYY-MM-DDTHH:MM:SSZ"
  // }
]
```
*   `name_snapshot` and `price_snapshot` store item details at the time of order.

## 5. Pydantic Models (`app/schemas.py`):
Define models for:
*   `Token`, `TokenData` (JWT)
*   `UserBase`, `UserCreate`, `User`, `UserInDB`
*   `MenuItemBase`, `MenuItemCreate`, `MenuItemUpdate`, `MenuItem`
*   `LocationBase`, `LocationCreate`, `Location`
*   `OrderItemBase`, `OrderItemCreate`, `OrderItem`
*   `OrderBase`, `OrderCreate`, `Order`

## 6. API Endpoints (`app/api/v1/endpoints/`):

### Authentication (`auth.py`):
*   `POST /token`: Login, returns JWT.

### Users (`users.py`):
*   `POST /users/`: Create user (admin).
*   `GET /users/me/`: Get current user info.

### Locations (`locations.py`):
*   `POST /locations/`: Create location (generates `numeric_id`, `qr_code_link`).
*   `GET /locations/`: List locations.
*   `GET /locations/{location_id}`: Get specific location.
*   `PUT /locations/{location_id}`: Update location.
*   `DELETE /locations/{location_id}`: Delete location.

### Menu Items (`menu_items.py`):
*   `POST /menu-items/`: Create menu item (with image upload).
*   `GET /menu-items/`: List menu items (filterable by location).
*   `GET /menu-items/{item_id}`: Get specific menu item.
*   `PUT /menu-items/{item_id}`: Update menu item.
*   `DELETE /menu-items/{item_id}`: Delete menu item.
*   `POST /locations/{location_id}/menu-items/{item_id}`: Associate item with location.
*   `DELETE /locations/{location_id}/menu-items/{item_id}`: Disassociate item from location.

### Orders (`orders.py`):
*   `POST /orders/`: Create new order (used by Telegram bot).
*   `GET /orders/`: List orders (filterable).
*   `GET /orders/{order_id}`: Get specific order.
*   `PUT /orders/{order_id}/status`: Update order status.

## 7. QR Codes & Telegram Bot Logic:

*   **QR Code Generation:**
    1.  Backend generates unique `numeric_id` for new locations.
    2.  Forms link: `https://t.me/aeroclubappbot/?start={numeric_id}`.
    3.  Stores `numeric_id` and link with location data.
    4.  Admin frontend displays link/generates QR.
*   **Telegram Bot Interaction (`app/services/telegram_bot.py`):**
    1.  Bot (separate process/service) receives `/start {numeric_id}`.
    2.  Bot queries FastAPI backend (e.g., `GET /api/v1/locations/{numeric_id}/menu-items`) for location-specific menu.
    3.  Bot displays menu, handles item selection.
    4.  Bot submits finalized order to `POST /api/v1/orders/` on FastAPI backend.
    5.  Backend saves order.

## 8. Python Dependencies (`requirements.txt`):
```
fastapi
uvicorn[standard]
pydantic[email]
python-dotenv
passlib[bcrypt]
python-jose[cryptography]
python-multipart
# Optional, if bot is part of this project:
# python-telegram-bot
# or
# aiogram
