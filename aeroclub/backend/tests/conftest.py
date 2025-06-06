import pytest
import pytest_asyncio # For async fixtures
import httpx
import os
import json
import shutil
from typing import AsyncGenerator, Generator

# Adjust the import to correctly locate the 'app' module from the 'backend' directory
# This assumes 'pytest' is run from the 'aeroclub/backend' directory.
# The pythonpath in pytest.ini should help with this.
from app.main import app # FastAPI application instance
from app.core.config import settings # To get admin credentials
from app.crud import MAIN_DB_PATH as REAL_MAIN_DB_PATH
from app.crud import ORDERS_DB_PATH as REAL_ORDERS_DB_PATH
from app.crud import DB_DIR as REAL_DB_DIR

# Define paths for temporary test database files
TEST_DB_DIR = os.path.join(REAL_DB_DIR, "test_data")
TEST_MAIN_DB_PATH = os.path.join(TEST_DB_DIR, "test_main_db.json")
TEST_ORDERS_DB_PATH = os.path.join(TEST_DB_DIR, "test_orders_db.json")

@pytest.fixture(scope="session", autouse=True)
def setup_test_environment():
    """
    Fixture to set up the test environment once per session.
    - Creates a directory for test DB files.
    - Modifies CRUD paths to point to test DBs for the duration of the tests.
    - Cleans up test DB files after tests.
    """
    original_main_db_path = REAL_MAIN_DB_PATH
    original_orders_db_path = REAL_ORDERS_DB_PATH

    # Create test DB directory if it doesn't exist
    os.makedirs(TEST_DB_DIR, exist_ok=True)

    # Create empty test DB files or copy from a template if you have one
    with open(TEST_MAIN_DB_PATH, 'w') as f:
        json.dump({"users": [], "locations": [], "menu_items": [], "location_menu_associations": []}, f, indent=2)
    with open(TEST_ORDERS_DB_PATH, 'w') as f:
        json.dump([], f, indent=2)

    # Monkeypatch the DB paths in crud.py to use test DBs
    # This is a common way to redirect I/O during tests.
    # Important: This modification is global for the test session.
    import app.crud
    app.crud.MAIN_DB_PATH = TEST_MAIN_DB_PATH
    app.crud.ORDERS_DB_PATH = TEST_ORDERS_DB_PATH
    
    yield # This is where the tests run

    # Teardown: Restore original paths and remove test DB files/directory
    app.crud.MAIN_DB_PATH = original_main_db_path
    app.crud.ORDERS_DB_PATH = original_orders_db_path
    if os.path.exists(TEST_DB_DIR):
        shutil.rmtree(TEST_DB_DIR)


@pytest_asyncio.fixture(scope="function") # Changed to function scope for client re-creation per test
async def client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """
    Provides an asynchronous HTTP client for making requests to the FastAPI app.
    """
    # Use ASGITransport for httpx when testing an ASGI app like FastAPI
    transport = httpx.ASGITransport(app=app) # type: ignore 
    # The type: ignore is because ASGITransport might not be recognized by older linters/type checkers with httpx
    # but it's the correct way for httpx >= 0.20.0
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac

@pytest_asyncio.fixture(scope="function")
async def admin_auth_headers(client: httpx.AsyncClient) -> dict:
    """
    Fixture to get authentication headers for the admin user.
    It first ensures the admin user is created via the setup endpoint.
    """
    # 1. Attempt to create the admin user (idempotent, will fail if already exists or if users exist)
    #    We need to ensure the user DB is empty for this to succeed as per auth.py logic.
    #    The setup_test_environment fixture should ensure test_main_db.json is empty initially.
    try:
        await client.post("/api/v1/auth/setup-admin")
    except httpx.HTTPStatusError as e:
        if e.response.status_code not in [400, 409]: # 400 if users exist, 409 if admin login exists
             # If it's another error, or if setup is critical and failed unexpectedly, re-raise
             # For tests, we assume setup_admin should work or admin already exists.
             # print(f"Admin setup info: {e.response.status_code} - {e.response.text}")
             pass


    # 2. Log in as admin to get token
    login_data = {
        "username": settings.ADMIN_USERNAME,
        "password": settings.ADMIN_PASSWORD, # Plain text password from .env
    }
    response = await client.post("/api/v1/auth/token", data=login_data)
    response.raise_for_status() # Raise an exception for bad status codes
    token_data = response.json()
    return {"Authorization": f"Bearer {token_data['access_token']}"}

@pytest_asyncio.fixture(scope="function")
async def test_user_auth_headers(client: httpx.AsyncClient, admin_auth_headers: dict) -> dict:
    """
    Fixture to create a regular test user and return their auth headers.
    Requires admin privileges to create the user.
    """
    test_username = "testuser@example.com"
    test_password = "testpassword"
    
    user_create_data = {"login": test_username, "password": test_password}
    
    # Check if user already exists, if so, just log them in.
    # This requires a way to get user by login without auth, or we assume tests clean up.
    # For simplicity, we'll try to create, and if it fails with 409 (conflict), we assume user exists.
    try:
        await client.post("/api/v1/users/", json=user_create_data, headers=admin_auth_headers)
    except httpx.HTTPStatusError as e:
        if e.response.status_code != 409: # 409 Conflict means user already exists
            raise # Re-raise other errors

    # Log in as the test user
    login_data = {"username": test_username, "password": test_password}
    response = await client.post("/api/v1/auth/token", data=login_data)
    response.raise_for_status()
    token_data = response.json()
    return {"Authorization": f"Bearer {token_data['access_token']}"}
