from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os

from app.api.v1.api import api_router_v1
from app.core.config import settings # To potentially use settings for CORS origins

# Define the path for serving uploaded menu item images
# UPLOAD_DIR is defined in menu_items.py, but we need a relative path for StaticFiles
# Assuming UPLOAD_DIR is backend/uploads/menu_images
# StaticFiles path should be relative to where main.py is or an absolute path.
# Let's construct it relative to the backend directory.
BACKEND_DIR = os.path.dirname(os.path.dirname(__file__)) # This should be the 'backend' directory
STATIC_FILES_DIR = os.path.join(BACKEND_DIR, "uploads") # Serving the whole 'uploads' directory

app = FastAPI(
    title="Aeroclub API",
    openapi_url="/api/v1/openapi.json" # Standard OpenAPI doc path
)

# CORS (Cross-Origin Resource Sharing)
# Allow all origins for development, or specify frontend URL in production
# origins = [
#     "http://localhost",
#     "http://localhost:3000", # Assuming React frontend runs on 3000
#     "http://localhost:5173", # Assuming Vite React frontend runs on 5173
#     # Add your frontend production URL here
# ]
# For development, allowing all origins is often easiest:
# origins = ["*"] # Allow all origins. Commented out as Cloudflare might be handling this.

# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=origins,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# Mount the v1 API router
app.include_router(api_router_v1, prefix="/api/v1")

# Mount static files for uploaded images
# The path "/uploads" will make files in STATIC_FILES_DIR accessible via /uploads URL
# e.g., if an image is at backend/uploads/menu_images/coffee.png, it would be /uploads/menu_images/coffee.png
if not os.path.exists(STATIC_FILES_DIR):
    os.makedirs(STATIC_FILES_DIR) # Ensure the base 'uploads' directory exists

app.mount("/uploads", StaticFiles(directory=STATIC_FILES_DIR), name="uploads")


@app.get("/")
async def root():
    return {"message": "Welcome to the Aeroclub API. Docs at /docs or /redoc."}

# Optional: Add a command to create the initial admin user if it doesn't exist
# This is better handled by a separate script or a one-time startup event.
# For simplicity, the /api/v1/auth/setup-admin endpoint can be called manually once.

# To run the app (from the 'backend' directory):
# uvicorn app.main:app --host 0.0.0.0 --reload
