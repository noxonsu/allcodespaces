from fastapi import APIRouter, Depends, HTTPException, status

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
    return schemas.User(id=created_user_db["id"], login=created_user_db["login"])


@router.get("/me/", response_model=schemas.User)
async def read_users_me(
    current_user: models_db.UserInDB = Depends(deps.get_current_active_user)
):
    """
    Get current user.
    """
    # Convert UserInDB (TypedDict) to User (Pydantic model) for response
    return schemas.User(id=current_user["id"], login=current_user["login"])
