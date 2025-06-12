from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Path
from typing import List, Optional
import uuid
import os
import shutil

from app import schemas, crud, models_db
from app.api.v1 import deps

router = APIRouter()

# Define a directory to store uploaded images for menu items
# This should ideally be configurable and outside the app code (e.g., a 'static' or 'media' folder served by a web server)
# For simplicity, creating it within the backend structure.
# Correct UPLOAD_DIR path to be relative to the 'backend' directory, consistent with static file serving in main.py
# __file__ is aeroclub/backend/app/api/v1/endpoints/menu_items.py
# We want aeroclub/backend/uploads/menu_images/
_BACKEND_ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")) # Navigates up to 'aeroclub/backend/'
UPLOAD_DIR = os.path.join(_BACKEND_ROOT_DIR, "uploads", "menu_images")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/", response_model=schemas.MenuItem, status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    name: str = Form(...),
    price: float = Form(...),
    image: Optional[UploadFile] = File(None),
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Create new menu item. Admin only.
    Handles optional image upload.
    """
    image_filename = None
    if image:
        # Sanitize filename and save the file
        # A more robust solution would check file type, size, and use a more secure way to generate filenames
        image_filename = f"{uuid.uuid4()}_{image.filename}"
        file_path = os.path.join(UPLOAD_DIR, image_filename)
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
        except Exception as e:
            # Basic error handling for file save
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Could not save image: {e}")
        finally:
            image.file.close()

    menu_item_in = schemas.MenuItemCreate(name=name, price=price, image_filename=image_filename)
    created_item_db = crud.create_menu_item(item_in=menu_item_in)
    return schemas.MenuItem(**created_item_db)


@router.get("/", response_model=List[schemas.MenuItem])
async def read_menu_items(
    skip: int = 0,
    limit: int = 100,
    location_id: Optional[uuid.UUID] = None, # Filter by location
    # No auth for listing menu items (publicly viewable or for bot)
):
    """
    Retrieve menu items. Can be filtered by location_id.
    """
    menu_items_db = crud.get_menu_items(location_id=str(location_id) if location_id else None)
    return [schemas.MenuItem(**item) for item in menu_items_db[skip : skip + limit]]


@router.get("/{item_id}", response_model=schemas.MenuItem)
async def read_menu_item(
    item_id: uuid.UUID,
    # No auth for specific menu item details
):
    """
    Get specific menu item by its ID.
    """
    item_db = crud.get_menu_item_by_id(str(item_id))
    if not item_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    return schemas.MenuItem(**item_db)


@router.post("/{item_id}", response_model=schemas.MenuItem) # Changed PUT to POST
async def update_menu_item(
    item_id: uuid.UUID,
    name: Optional[str] = Form(None),
    price: Optional[float] = Form(None),
    image: Optional[UploadFile] = File(None),
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Update a menu item. Admin only.
    Allows partial updates and new image upload (replaces old if any).
    """
    item_db = crud.get_menu_item_by_id(str(item_id))
    if not item_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    image_filename = item_db.get("image_filename") # Keep old image if new one not provided

    if image:
        # If a new image is uploaded, delete the old one if it exists
        if image_filename and os.path.exists(os.path.join(UPLOAD_DIR, image_filename)):
            try:
                os.remove(os.path.join(UPLOAD_DIR, image_filename))
            except OSError as e:
                print(f"Error deleting old image {image_filename}: {e}") # Log error but continue

        # Save the new image
        new_image_filename = f"{uuid.uuid4()}_{image.filename}"
        file_path = os.path.join(UPLOAD_DIR, new_image_filename)
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(image.file, buffer)
            image_filename = new_image_filename # Update to new filename
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Could not save new image: {e}")
        finally:
            image.file.close()

    item_update_data = schemas.MenuItemUpdate(name=name, price=price, image_filename=image_filename)
    
    # Filter out None values from item_update_data before passing to CRUD
    # The CRUD function's model_dump(exclude_unset=True) should handle this, but being explicit here.
    update_dict = {k: v for k, v in item_update_data.model_dump().items() if v is not None}
    
    # If only image is updated, and name/price are None, they won't be in update_dict.
    # We need to ensure image_filename is passed if it changed or was set.
    if image_filename != item_db.get("image_filename") or (image_filename and "image_filename" not in update_dict):
         update_dict["image_filename"] = image_filename


    if not update_dict : # if nothing to update (e.g. only image was sent but it failed or was same)
        # Or if only image was sent and it's the same as before
        if image_filename == item_db.get("image_filename") and not name and price is None:
             return schemas.MenuItem(**item_db) # No changes, return current


    updated_item_db = crud.update_menu_item(item_id=str(item_id), item_in=schemas.MenuItemUpdate(**update_dict))
    if not updated_item_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found during update")
    return schemas.MenuItem(**updated_item_db)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_menu_item(
    item_id: uuid.UUID,
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Delete a menu item. Admin only.
    Also removes its associations with locations and deletes its image file.
    """
    item_db = crud.get_menu_item_by_id(str(item_id))
    if not item_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    # Delete image file if it exists
    image_filename = item_db.get("image_filename")
    if image_filename:
        file_path = os.path.join(UPLOAD_DIR, image_filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as e:
                # Log error but proceed with deleting DB entry
                print(f"Error deleting image file {file_path}: {e}")

    success = crud.delete_menu_item(item_id=str(item_id))
    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete menu item")
    return None


# --- Location <-> MenuItem Association Endpoints ---

@router.post("/locations/{location_id}/menu-items/{item_id}", status_code=status.HTTP_201_CREATED, summary="Associate Menu Item to Location")
async def associate_menu_item_to_location(
    location_id: uuid.UUID = Path(..., description="ID of the location"),
    item_id: uuid.UUID = Path(..., description="ID of the menu item"),
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Associate a menu item with a location. Admin only.
    """
    if not crud.get_location_by_id(str(location_id)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    if not crud.get_menu_item_by_id(str(item_id)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    success = crud.associate_item_to_location(location_id=str(location_id), item_id=str(item_id))
    if not success: # Should ideally not happen if checks pass, but implies an issue during association
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Could not associate item to location, or already associated.")
    # No response body for successful association, status 201 indicates creation/success.
    # Or return a meaningful message:
    return {"message": "Menu item successfully associated with location."}


@router.delete("/locations/{location_id}/menu-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Disassociate Menu Item from Location")
async def disassociate_menu_item_from_location(
    location_id: uuid.UUID = Path(..., description="ID of the location"),
    item_id: uuid.UUID = Path(..., description="ID of the menu item"),
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user)
):
    """
    Disassociate a menu item from a location. Admin only.
    """
    if not crud.get_location_by_id(str(location_id)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    if not crud.get_menu_item_by_id(str(item_id)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    success = crud.disassociate_item_from_location(location_id=str(location_id), item_id=str(item_id))
    if not success:
        # This could mean the association didn't exist in the first place.
        # For a DELETE operation, not finding the resource to delete is often treated as success (idempotency).
        # However, if crud.disassociate_item_from_location returns False only on actual error, then 500 is appropriate.
        # Assuming it returns False if association didn't exist or on error.
        # To be more specific, crud could return different signals.
        # For now, if it didn't exist, it's effectively "deleted" or "not there".
        # Let's assume crud.disassociate returns False if it wasn't found to be disassociated.
        pass # No error if not found, it's already "disassociated"
    return None

# Endpoint for Telegram bot to get menu for a specific location (using numeric_id)
@router.get("/locations/{numeric_id}/menu", response_model=List[schemas.MenuItem])
async def get_menu_for_location_numeric_id(
    numeric_id: int = Path(..., description="Numeric ID of the location for the Telegram bot")
):
    """
    Retrieve menu items for a specific location using its numeric_id.
    This endpoint is intended for the Telegram bot.
    """
    location = crud.get_location_by_numeric_id(numeric_id)
    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Location with numeric ID {numeric_id} not found.")
    
    menu_items_db = crud.get_menu_items(location_id=location["id"])
    return [schemas.MenuItem(**item) for item in menu_items_db]
