from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import uuid # Добавляем импорт uuid

from app import schemas, crud, models_db
from app.api.v1 import deps

router = APIRouter()

@router.post("/", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_in: schemas.UserCreate,
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user) # Ensures only admin can create users
):
    """
    Create new user. Only accessible by admin users.
    """
    existing_user = crud.get_user_by_login(login=user_in.login)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"User with login '{user_in.login}' already exists.",
        )
    
    created_user_db = crud.create_user(user_in=user_in)
    # Convert UserInDB (TypedDict) to User (Pydantic model) for response
    return schemas.User(
        id=created_user_db["id"], 
        login=created_user_db["login"],
        location_id=uuid.UUID(created_user_db["location_id"]) if created_user_db.get("location_id") else None
    )


@router.get("/me/", response_model=schemas.User)
async def read_users_me(
    current_user: models_db.UserInDB = Depends(deps.get_current_active_user)
):
    """
    Get current user.
    """
    # Convert UserInDB (TypedDict) to User (Pydantic model) for response
    return schemas.User(id=current_user["id"], login=current_user["login"])


@router.get("/", response_model=List[schemas.User])
async def read_users(
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user) # Ensures only admin can access
):
    """
    Retrieve all users. Only accessible by admin users.
    """
    users_db_with_locations = crud.get_users()
    # Convert List[Dict[str, Any]] to List[schemas.User]
    response_users = []
    for user_data in users_db_with_locations:
        location_id_uuid = None
        if user_data.get("location_id"):
            try:
                location_id_uuid = uuid.UUID(user_data["location_id"])
            except ValueError: # Handle cases where location_id might not be a valid UUID string
                location_id_uuid = None
        
        response_users.append(schemas.User(
            id=uuid.UUID(user_data["id"]), # Ensure id is also UUID object
            login=user_data["login"],
            location_id=location_id_uuid,
            location_name=user_data.get("location_name")
        ))
    return response_users
