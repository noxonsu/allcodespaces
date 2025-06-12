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


@router.post("/{user_id}", response_model=schemas.User)
async def update_user(
    user_id: uuid.UUID,
    user_in: schemas.UserUpdate,
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Update a user. Only accessible by admin users.
    """
    user_db = crud.get_user_by_id(str(user_id))
    if not user_db:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if login is being changed and if the new login already exists
    if user_in.login and user_in.login != user_db.get("login"):
        existing_user = crud.get_user_by_login(login=user_in.login)
        if existing_user and str(existing_user.get("id")) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"User with login '{user_in.login}' already exists.",
            )
    
    updated_user_db = crud.update_user(user_id=str(user_id), user_in=user_in)
    if not updated_user_db:
        # This might happen if the user was deleted between the get and update,
        # or if update_user itself has an issue.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, # Or 500 if it's an internal update issue
            detail="User not found during update or update failed.",
        )
    
    return schemas.User(
        id=updated_user_db["id"],
        login=updated_user_db["login"],
        location_id=uuid.UUID(updated_user_db["location_id"]) if updated_user_db.get("location_id") else None,
        location_name=updated_user_db.get("location_name") # Assuming crud.update_user can return this
    )
