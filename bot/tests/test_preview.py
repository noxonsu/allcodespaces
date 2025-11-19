"""
Tests for message preview functionality in bot.

CHANGE: Added tests for preview token handling
WHY: Issue #52 requires bot to handle preview tokens and send message previews
REF: #52
"""
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from telegram import Update, User, Message, Chat
from telegram.ext import ContextTypes

from bot_handlers import admin_start_handler


@pytest.fixture
def mock_update():
    """Create a mock Update object for testing."""
    update = MagicMock(spec=Update)
    update.message = MagicMock(spec=Message)
    update.message.chat_id = 12345
    update.message.from_user = MagicMock(spec=User)
    update.message.from_user.id = 12345
    update.message.from_user.username = "testuser"
    update.message.from_user.first_name = "Test"
    update.message.from_user.last_name = "User"
    update.message.chat = MagicMock(spec=Chat)
    return update


@pytest.fixture
def mock_context():
    """Create a mock context object for testing."""
    context = MagicMock()
    context.bot = AsyncMock()
    context.bot.send_message = AsyncMock()
    context.bot.send_photo = AsyncMock()
    context.bot.send_video = AsyncMock()
    context.bot.edit_message_text = AsyncMock()
    return context


@pytest.mark.asyncio
async def test_start_with_valid_token(mock_update, mock_context):
    """Test /start with valid preview token."""
    # Setup
    token = "test-token-123"
    mock_context.args = [token]

    message_id = str(uuid4())
    preview_response = {
        "message": {
            "id": message_id,
            "as_text": "Test preview message",
            "image": None,
            "video": None,
            "buttons": [{"title": "Click me", "url": "https://example.com"}],
        },
        "token": token,
    }

    with patch("bot_handlers.MainService") as MockService:
        mock_service = MockService.return_value
        mock_service.resolve_preview_token.return_value = preview_response

        # Execute
        await admin_start_handler(mock_update, mock_context)

        # Assert
        mock_service.resolve_preview_token.assert_called_once_with(token)
        mock_context.bot.send_message.assert_called_once()
        call_kwargs = mock_context.bot.send_message.call_args.kwargs
        assert call_kwargs["chat_id"] == 12345
        assert "Test preview message" in call_kwargs["text"]
        assert "reply_markup" in call_kwargs  # Should have button


@pytest.mark.asyncio
async def test_start_with_invalid_token(mock_update, mock_context):
    """Test /start with invalid/expired token."""
    # Setup
    token = "invalid-token"
    mock_context.args = [token]

    with patch("bot_handlers.MainService") as MockService:
        mock_service = MockService.return_value
        mock_service.resolve_preview_token.return_value = None

        # Execute
        await admin_start_handler(mock_update, mock_context)

        # Assert
        mock_service.resolve_preview_token.assert_called_once_with(token)
        mock_context.bot.send_message.assert_called_once()
        call_kwargs = mock_context.bot.send_message.call_args.kwargs
        assert "недействительна" in call_kwargs["text"].lower()


@pytest.mark.asyncio
async def test_start_with_image_preview(mock_update, mock_context):
    """Test /start with image preview."""
    # Setup
    token = "test-token-image"
    mock_context.args = [token]

    preview_response = {
        "message": {
            "id": str(uuid4()),
            "as_text": "Image preview",
            "image": "https://example.com/image.jpg",
            "video": None,
            "buttons": [],
        },
        "token": token,
    }

    with patch("bot_handlers.MainService") as MockService:
        mock_service = MockService.return_value
        mock_service.resolve_preview_token.return_value = preview_response

        # Execute
        await admin_start_handler(mock_update, mock_context)

        # Assert
        mock_context.bot.send_photo.assert_called_once()
        call_kwargs = mock_context.bot.send_photo.call_args.kwargs
        assert call_kwargs["photo"] == "https://example.com/image.jpg"
        assert call_kwargs["caption"] == "Image preview"


@pytest.mark.asyncio
async def test_start_with_video_preview(mock_update, mock_context):
    """Test /start with video preview."""
    # Setup
    token = "test-token-video"
    mock_context.args = [token]

    preview_response = {
        "message": {
            "id": str(uuid4()),
            "as_text": "Video preview",
            "image": None,
            "video": "https://example.com/video.mp4",
            "buttons": [],
        },
        "token": token,
    }

    with patch("bot_handlers.MainService") as MockService:
        mock_service = MockService.return_value
        mock_service.resolve_preview_token.return_value = preview_response

        # Execute
        await admin_start_handler(mock_update, mock_context)

        # Assert
        mock_context.bot.send_video.assert_called_once()
        call_kwargs = mock_context.bot.send_video.call_args.kwargs
        assert call_kwargs["video"] == "https://example.com/video.mp4"
        assert call_kwargs["caption"] == "Video preview"


@pytest.mark.asyncio
async def test_start_without_token_regular_flow(mock_update, mock_context):
    """Test /start without token (regular flow)."""
    # Setup
    mock_context.args = []

    with patch("bot_handlers.MainService") as MockService:
        mock_service = MockService.return_value
        mock_service.channel_admin_join.return_value = None

        mock_context.bot.send_message.return_value = MagicMock(message_id=999)

        # Execute
        await admin_start_handler(mock_update, mock_context)

        # Assert
        assert mock_context.bot.send_message.call_count >= 1
        mock_context.bot.edit_message_text.assert_called_once()
        # Should show welcome text
        call_kwargs = mock_context.bot.edit_message_text.call_args.kwargs
        assert "ТЕЛЕВИН" in call_kwargs["text"]


@pytest.mark.asyncio
async def test_preview_send_error_handling(mock_update, mock_context):
    """Test error handling when sending preview fails."""
    # Setup
    token = "test-token-error"
    mock_context.args = [token]

    preview_response = {
        "message": {
            "id": str(uuid4()),
            "as_text": "Error test",
            "image": None,
            "video": None,
            "buttons": [],
        },
        "token": token,
    }

    with patch("bot_handlers.MainService") as MockService:
        mock_service = MockService.return_value
        mock_service.resolve_preview_token.return_value = preview_response
        mock_context.bot.send_message.side_effect = [
            Exception("Network error"),
            AsyncMock(),  # Second call for error message
        ]

        # Execute
        await admin_start_handler(mock_update, mock_context)

        # Assert
        assert mock_context.bot.send_message.call_count == 2
        # Last call should be error message
        last_call_kwargs = mock_context.bot.send_message.call_args.kwargs
        assert "Ошибка" in last_call_kwargs["text"]


def test_resolve_preview_token_success():
    """Test MainService.resolve_preview_token with valid token."""
    from services import MainService

    with patch.object(MainService, "__init__", lambda x: None):
        service = MainService()
        service.urls = {"preview_resolve": "/api/message/preview/resolve/"}

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "message": {"id": "123", "as_text": "Test"},
            "token": "test-token",
        }
        mock_client.post.return_value = mock_response
        service.client = mock_client

        result = service.resolve_preview_token("test-token")

        assert result is not None
        assert result["token"] == "test-token"
        mock_client.post.assert_called_once_with(
            "/api/message/preview/resolve/", json={"token": "test-token"}
        )


def test_resolve_preview_token_invalid():
    """Test MainService.resolve_preview_token with invalid token."""
    from services import MainService

    with patch.object(MainService, "__init__", lambda x: None):
        service = MainService()
        service.urls = {"preview_resolve": "/api/message/preview/resolve/"}

        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_client.post.return_value = mock_response
        service.client = mock_client

        result = service.resolve_preview_token("invalid-token")

        assert result is None


def test_resolve_preview_token_network_error():
    """Test MainService.resolve_preview_token with network error."""
    from services import MainService

    with patch.object(MainService, "__init__", lambda x: None):
        service = MainService()
        service.urls = {"preview_resolve": "/api/message/preview/resolve/"}

        mock_client = MagicMock()
        mock_client.post.side_effect = Exception("Network error")
        service.client = mock_client

        result = service.resolve_preview_token("test-token")

        assert result is None
