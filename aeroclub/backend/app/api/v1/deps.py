from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from pydantic import ValidationError

from app.core import security
from app.core.config import settings
from app import schemas, crud, models_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"/api/v1/auth/token") # Adjusted tokenUrl to match endpoint

async def get_current_user(token: str = Depends(oauth2_scheme)) -> models_db.UserInDB:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = security.decode_token(token)
        if payload is None:
            raise credentials_exception
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except (JWTError, ValidationError):
        raise credentials_exception
    
    user = crud.get_user_by_login(login=token_data.username)
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: models_db.UserInDB = Depends(get_current_user)) -> models_db.UserInDB:
    # In a real application, you might check if the user is active (e.g., not banned)
    # For this example, we'll just return the user.
    # if not current_user.is_active: # Assuming an is_active field in UserInDB model if needed
    #     raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

# Dependency to check if the current user is the admin
# This is a simplified check based on the username from the .env file.
# A more robust system might use roles or permissions.
async def get_current_admin_user(current_user: models_db.UserInDB = Depends(get_current_active_user)) -> models_db.UserInDB:
    if current_user["login"] != settings.ADMIN_USERNAME:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The user doesn't have enough privileges"
        )
    return current_user
