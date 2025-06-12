from fastapi import APIRouter, Depends, HTTPException, status, Path
from fastapi.responses import StreamingResponse
from typing import List, Union
import uuid
import qrcode # Для генерации QR-кодов
from PIL import Image # Для работы с изображениями QR-кодов
import io # Для отправки изображения в ответе

from app import schemas, crud, models_db
from app.api.v1 import deps
from app.core.config import settings # Импортируем настройки

router = APIRouter()

@router.post("/", response_model=schemas.Location, status_code=status.HTTP_201_CREATED)
async def create_location(
    location_in: schemas.LocationCreate,
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Create new location. Admin only.
    Generates numeric_id and qr_code_link automatically.
    """
    created_loc_db = crud.create_location(location_in=location_in)
    # Convert LocationInDB (TypedDict) to Location (Pydantic model)
    return schemas.Location(**created_loc_db)

@router.get("/", response_model=List[schemas.Location])
async def read_locations(
    skip: int = 0,
    limit: int = 100,
    # No auth needed for listing locations as per plan (publicly viewable or for bot)
    # If auth is needed: current_user: models_db.UserInDB = Depends(deps.get_current_active_user)
):
    """
    Retrieve locations.
    """
    locations_db = crud.get_locations()
    # Convert List[LocationInDB] to List[Location]
    return [schemas.Location(**loc) for loc in locations_db[skip : skip + limit]]

@router.get("/{location_id_or_numeric_id}", response_model=schemas.Location)
async def read_location(
    location_id_or_numeric_id: Union[uuid.UUID, int] = Path(..., description="The ID (UUID) or Numeric ID of the location to retrieve"),
    # No auth needed for specific location details as per plan
):
    """
    Get specific location by its UUID or Numeric ID.
    """
    location_db = None
    if isinstance(location_id_or_numeric_id, uuid.UUID):
        location_db = crud.get_location_by_id(str(location_id_or_numeric_id))
    elif isinstance(location_id_or_numeric_id, int):
        location_db = crud.get_location_by_numeric_id(location_id_or_numeric_id)
    
    if not location_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return schemas.Location(**location_db)

@router.post("/{location_id}", response_model=schemas.Location) # Changed PUT to POST
async def update_location(
    location_id: uuid.UUID,
    location_in: schemas.LocationCreate, # Using LocationCreate as it only contains address
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Update a location's address. Admin only.
    Numeric ID and QR code link are not updatable via this endpoint.
    """
    location_db = crud.get_location_by_id(str(location_id))
    if not location_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    
    updated_loc_db = crud.update_location(location_id=str(location_id), location_in=location_in)
    if not updated_loc_db: # Should not happen if previous check passed, but good for safety
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found during update")
    return schemas.Location(**updated_loc_db)

@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_location(
    location_id: uuid.UUID,
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Delete a location. Admin only.
    Also removes associated menu items from this location.
    """
    location_db = crud.get_location_by_id(str(location_id))
    if not location_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    
    success = crud.delete_location(location_id=str(location_id))
    if not success:
        # This case should ideally not be reached if the initial check passes
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete location")
    return None

@router.post("/{location_id}/menu-items/{item_id}/associate", status_code=status.HTTP_200_OK, summary="Associate Menu Item with Location")
async def associate_menu_item_with_location(
    location_id: uuid.UUID = Path(..., description="The ID of the location"),
    item_id: uuid.UUID = Path(..., description="The ID of the menu item"),
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Associate an existing menu item with an existing location.
    This makes the menu item available at that location.
    - **location_id**: UUID of the location.
    - **item_id**: UUID of the menu item.
    \f
    Requires admin privileges.
    """
    success = crud.associate_item_to_location(location_id=str(location_id), item_id=str(item_id))
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location or Menu Item not found, or association failed.")
    return {"message": "Menu item successfully associated with location."}

@router.get("/{location_id_or_numeric_id}/qr-code", summary="Get QR Code for Location")
async def get_location_qr_code(
    location_id_or_numeric_id: Union[uuid.UUID, int] = Path(..., description="The ID (UUID) or Numeric ID of the location for the QR code"),
    # No auth needed for QR code generation as per typical use case
):
    """
    Generates and returns a QR code for the specified location.
    The QR code will contain the URL: `TELEGRAM_MINI_APP_BASE_URL` + `numeric_id`.
    Example: `https://t.me/yourbot/yourapp/?startapp=1001`
    """
    location_db = None
    if isinstance(location_id_or_numeric_id, uuid.UUID):
        location_db = crud.get_location_by_id(str(location_id_or_numeric_id))
    elif isinstance(location_id_or_numeric_id, int):
        location_db = crud.get_location_by_numeric_id(location_id_or_numeric_id)
    
    if not location_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    numeric_id = location_db.get("numeric_id")
    if not numeric_id:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Location numeric ID is missing.")

    if not settings.TELEGRAM_MINI_APP_BASE_URL:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TELEGRAM_MINI_APP_BASE_URL is not configured in the server settings. Please contact the administrator."
        )

    # Убедимся, что базовый URL заканчивается на /?startapp=
    base_url = settings.TELEGRAM_MINI_APP_BASE_URL
    if not base_url.endswith("?startapp="):
        if base_url.endswith("/"):
            base_url += "?startapp="
        else:
            base_url += "/?startapp="
            
    qr_data = f"{base_url}{numeric_id}"

    # Generate QR code
    img = qrcode.make(qr_data)
    
    # Save QR code to a bytes buffer
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0) # Go to the beginning of the buffer

    return StreamingResponse(buf, media_type="image/png")
