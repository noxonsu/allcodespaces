import pytest
import httpx
from fastapi import status

from app.core.config import settings # For admin credentials

# All test coroutines will be treated as marked.
pytestmark = pytest.mark.asyncio


async def test_setup_admin_on_empty_db(client: httpx.AsyncClient):
    """Test that the /setup-admin endpoint creates the admin user when the DB is empty."""
    # The setup_test_environment fixture in conftest.py ensures the test DB is initially empty.
    response = await client.post("/api/v1/auth/setup-admin")
    assert response.status_code == status.HTTP_200_OK # Changed from 201 as per auth.py
    user_data = response.json()
    assert user_data["login"] == settings.ADMIN_USERNAME
    assert "id" in user_data

async def test_setup_admin_fails_if_users_exist(client: httpx.AsyncClient, admin_auth_headers: dict):
    """
    Test that /setup-admin fails if users (even the admin itself) already exist.
    The admin_auth_headers fixture ensures the admin is already set up.
    """
    response = await client.post("/api/v1/auth/setup-admin")
    # Expect 400 because admin user (and thus users list) is not empty due to admin_auth_headers fixture
    assert response.status_code == status.HTTP_400_BAD_REQUEST 
    assert "Admin user setup can only be run on an empty user database" in response.text

async def test_login_for_access_token(client: httpx.AsyncClient, admin_auth_headers: dict):
    """
    Test successful login and token generation for the admin user.
    The admin_auth_headers fixture itself performs this login, so this test re-verifies.
    """
    login_data = {
        "username": settings.ADMIN_USERNAME,
        "password": settings.ADMIN_PASSWORD,
    }
    response = await client.post("/api/v1/auth/token", data=login_data)
    assert response.status_code == status.HTTP_200_OK
    token_data = response.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"

async def test_login_with_incorrect_password(client: httpx.AsyncClient):
    """Test login failure with incorrect password."""
    # Ensure admin is setup first by calling the fixture that does it
    try:
        await client.post("/api/v1/auth/setup-admin")
    except httpx.HTTPStatusError: # Ignore if it fails (e.g. admin already exists)
        pass

    login_data = {
        "username": settings.ADMIN_USERNAME,
        "password": "wrong_password",
    }
    response = await client.post("/api/v1/auth/token", data=login_data)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Incorrect username or password" in response.json()["detail"]

async def test_login_with_nonexistent_user(client: httpx.AsyncClient):
    """Test login failure with a username that does not exist."""
    login_data = {
        "username": "nonexistentuser@example.com",
        "password": "any_password",
    }
    response = await client.post("/api/v1/auth/token", data=login_data)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert "Incorrect username or password" in response.json()["detail"]

async def test_read_users_me(client: httpx.AsyncClient, admin_auth_headers: dict):
    """Test the /users/me endpoint to get current user info."""
    response = await client.get("/api/v1/users/me/", headers=admin_auth_headers)
    assert response.status_code == status.HTTP_200_OK
    user_data = response.json()
    assert user_data["login"] == settings.ADMIN_USERNAME
    assert "id" in user_data

async def test_read_users_me_unauthenticated(client: httpx.AsyncClient):
    """Test that /users/me requires authentication."""
    response = await client.get("/api/v1/users/me/")
    assert response.status_code == status.HTTP_401_UNAUTHORIZED
    assert response.json()["detail"] == "Not authenticated" # FastAPI's default for missing token
