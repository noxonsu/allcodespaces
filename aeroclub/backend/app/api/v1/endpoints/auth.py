import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

# Application-specific imports
from app import schemas, crud
from app.core import security
from app.core.config import settings
from app.api.v1 import deps

# Logging setup
logger = logging.getLogger(__name__)
# Configure basicConfig only if no handlers are already set up (safer for modules)
# Ideally, basicConfig is called once in the main application entry point (e.g., main.py).
if not logging.getLogger().hasHandlers():
    logging.basicConfig(level=logging.INFO)

router = APIRouter()

@router.post("/token", response_model=schemas.Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    logger.info(f"Login attempt for username: {form_data.username}")
    user = crud.get_user_by_login(login=form_data.username)
    
    if not user:
        logger.warning(f"User '{form_data.username}' not found.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"User '{form_data.username}' found. Stored hash: {user['hashed_password']}")
    password_verified = security.verify_password(form_data.password, user["hashed_password"])
    logger.info(f"Password verification result for '{form_data.username}': {password_verified}")
    
    if not password_verified:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(
        subject=user["login"], expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

# Endpoint to initialize the first admin user if one doesn't exist.
# This is a convenience for setup. In a production environment, this might be handled differently (e.g., a CLI command).
@router.post("/setup-admin", response_model=schemas.User, summary="Setup initial admin user", description="Creates the admin user if no users exist in the database. Uses credentials from .env.")
async def setup_admin():
    db_users = crud.read_main_db()["users"]
    if db_users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin user setup can only be run on an empty user database."
        )

    admin_username = settings.ADMIN_USERNAME
    admin_password = settings.ADMIN_PASSWORD # This should be the plain text password for initial setup

    # Check if admin already exists (e.g. if this endpoint is called multiple times before any other user is created)
    existing_admin = crud.get_user_by_login(admin_username)
    if existing_admin:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with login '{admin_username}' already exists."
        )

    user_in_create = schemas.UserCreate(login=admin_username, password=admin_password)
    
    try:
        created_user_db = crud.create_user(user_in=user_in_create)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create admin user: {str(e)}"
        )
    
    # Convert UserInDB (TypedDict) to User (Pydantic model) for response
    return schemas.User(id=created_user_db["id"], login=created_user_db["login"])
