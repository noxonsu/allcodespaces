from fastapi import APIRouter, Depends, HTTPException, status, Query, Path
from typing import List, Optional, Union
import uuid

from app import schemas, crud, models_db
from app.api.v1 import deps

router = APIRouter()

@router.post("/", response_model=schemas.Order, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_in: schemas.OrderCreate,
    # Orders can be created by the Telegram bot (unauthenticated) or potentially an authenticated user/admin later.
    # For now, let's assume the Telegram bot makes unauthenticated requests to this endpoint.
    # If admin creation is needed: current_user: models_db.UserInDB = Depends(deps.get_current_active_user)
):
    """
    Create new order.
    This endpoint is primarily used by the Telegram bot.
    It can also be used by authenticated users if needed in the future.
    """
    try:
        # Validate menu items in the order
        for item_in_order in order_in.items:
            menu_item_db = crud.get_menu_item_by_id(str(item_in_order.menu_item_id))
            if not menu_item_db:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Menu item with ID {item_in_order.menu_item_id} not found."
                )
            # Optionally, verify name_snapshot and price_snapshot against current menu_item_db details
            # For now, we trust the snapshots provided by the client (Telegram bot)

        created_order_db = crud.create_order(order_in=order_in)
        # Convert OrderInDB to Order Pydantic model
        # Need to convert items list as well
        order_items_pydantic = [schemas.OrderItem(**item) for item in created_order_db["items"]]
        
        response_order_data = created_order_db.copy() # Make a copy to modify
        response_order_data["items"] = order_items_pydantic
        
        return schemas.Order(**response_order_data)

    except ValueError as e: # Catch ValueErrors from CRUD (e.g., location not found)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        # General error catch
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"An error occurred: {str(e)}")


@router.get("/", response_model=List[schemas.Order])
async def read_orders(
    skip: int = 0,
    limit: int = 100,
    location_id: Optional[Union[uuid.UUID, int]] = Query(None, description="Filter by location ID (UUID or Numeric ID)"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by order status (e.g., pending, completed)"),
    telegram_user_id: Optional[str] = Query(None, description="Filter by Telegram User ID"),
    current_user: models_db.UserInDB = Depends(deps.get_current_active_user) # Requires auth to view orders
):
    """
    Retrieve orders. Requires authentication.
    Can be filtered by location_id, status, or telegram_user_id.
    """
    orders_db = crud.get_orders(
        location_id=location_id, 
        status=status_filter,
        telegram_user_id=telegram_user_id
    )
    
    # Convert List[OrderInDB] to List[schemas.Order]
    result_orders = []
    for order_db in orders_db[skip : skip + limit]:
        order_items_pydantic = [schemas.OrderItem(**item) for item in order_db["items"]]
        order_data_copy = order_db.copy()
        order_data_copy["items"] = order_items_pydantic
        result_orders.append(schemas.Order(**order_data_copy))
        
    return result_orders


@router.get("/{order_id}", response_model=schemas.Order)
async def read_order(
    order_id: uuid.UUID,
    current_user: models_db.UserInDB = Depends(deps.get_current_active_user) # Requires auth
):
    """
    Get specific order by its ID. Requires authentication.
    """
    order_db = crud.get_order_by_id(str(order_id))
    if not order_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    
    order_items_pydantic = [schemas.OrderItem(**item) for item in order_db["items"]]
    order_data_copy = order_db.copy()
    order_data_copy["items"] = order_items_pydantic
    return schemas.Order(**order_data_copy)


@router.put("/{order_id}/status", response_model=schemas.Order)
async def update_order_status(
    order_id: uuid.UUID,
    new_status: str = Query(..., description="The new status for the order (e.g., processing, completed, cancelled)"),
    current_admin: models_db.UserInDB = Depends(deps.get_current_admin_user) # Only admin can change status
):
    """
    Update an order's status. Admin only.
    """
    order_db = crud.get_order_by_id(str(order_id))
    if not order_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    # Basic validation for status, more complex validation could be added
    allowed_statuses = ["pending", "processing", "completed", "cancelled"]
    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Allowed statuses are: {', '.join(allowed_statuses)}"
        )

    updated_order_db = crud.update_order_status(order_id=str(order_id), status=new_status)
    if not updated_order_db:
        # This should ideally not happen if the first check passed
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found during status update")

    order_items_pydantic = [schemas.OrderItem(**item) for item in updated_order_db["items"]]
    order_data_copy = updated_order_db.copy()
    order_data_copy["items"] = order_items_pydantic
    return schemas.Order(**order_data_copy)
