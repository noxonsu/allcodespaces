"""
CHANGE: Added webhook client for microservice integration
WHY: Required by ТЗ 4.1.1 - send notifications on channel add/delete
QUOTE(ТЗ): "разработать webhooks/очередь сообщений при добавлении канала или soft delete"
REF: issue #45
"""
from typing import Dict, Any, Optional
from enum import Enum
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from web_app.app_settings import app_settings
from web_app.logger import logger


class ChannelEventType(str, Enum):
    """Types of channel events to send to microservice"""
    CHANNEL_ADDED = "channel_added"
    CHANNEL_DELETED = "channel_deleted"  # soft delete
    CHANNEL_RESTORED = "channel_restored"
    CHANNEL_UPDATED = "channel_updated"


class ParserMicroserviceClient:
    """
    Client for sending channel events to parsing microservice.

    Implements retry logic and error handling for webhook notifications.
    """

    def __init__(self):
        self.base_url = app_settings.PARSER_MICROSERVICE_URL
        self.api_key = app_settings.PARSER_MICROSERVICE_API_KEY
        self.enabled = app_settings.PARSER_MICROSERVICE_ENABLED

        # Configure retry strategy
        retry_strategy = Retry(
            total=3,  # Retry up to 3 times
            backoff_factor=1,  # Wait 1s, 2s, 4s between retries
            status_forcelist=[429, 500, 502, 503, 504],  # Retry on these HTTP statuses
            allowed_methods=["POST"],  # Only retry POST requests
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session = requests.Session()
        self.session.mount("http://", adapter)
        self.session.mount("https://", adapter)

    def _build_channel_payload(self, channel, event_type: ChannelEventType) -> Dict[str, Any]:
        """
        Build webhook payload from Channel model.

        Args:
            channel: Channel model instance
            event_type: Type of event (added/deleted/restored/updated)

        Returns:
            Dictionary with channel data
        """
        return {
            "event_type": event_type.value,
            "channel": {
                "id": str(channel.id),
                "tg_id": channel.tg_id,
                "name": channel.name,
                "username": channel.username,
                "members_count": channel.members_count,
                "status": channel.status,
                "is_deleted": channel.is_deleted,
                "language": channel.language,
                "category": channel.category,
                "created_at": channel.created_at.isoformat() if channel.created_at else None,
                "updated_at": channel.updated_at.isoformat() if channel.updated_at else None,
            }
        }

    def send_channel_event(
        self,
        channel,
        event_type: ChannelEventType,
        timeout: int = 10
    ) -> Optional[requests.Response]:
        """
        Send channel event to microservice webhook.

        Args:
            channel: Channel model instance
            event_type: Type of event
            timeout: Request timeout in seconds

        Returns:
            Response object if successful, None if disabled or failed
        """
        if not self.enabled:
            logger.debug(f"Parser microservice integration disabled, skipping {event_type} event")
            return None

        if not self.base_url:
            logger.warning("PARSER_MICROSERVICE_URL not configured")
            return None

        try:
            payload = self._build_channel_payload(channel, event_type)
            headers = {
                "Content-Type": "application/json",
            }

            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            url = f"{self.base_url.rstrip('/')}/webhook/channel-events"

            logger.info(
                f"Sending {event_type} event for channel {channel.name} (tg_id={channel.tg_id}) to {url}"
            )

            response = self.session.post(
                url,
                json=payload,
                headers=headers,
                timeout=timeout
            )

            response.raise_for_status()

            logger.info(
                f"Successfully sent {event_type} event for channel {channel.name}: "
                f"{response.status_code} {response.text[:200]}"
            )

            return response

        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout sending {event_type} event for channel {channel.name}: {e}")
            return None

        except requests.exceptions.RequestException as e:
            logger.error(
                f"Failed to send {event_type} event for channel {channel.name}: {e}",
                exc_info=True
            )
            return None

        except Exception as e:
            logger.error(
                f"Unexpected error sending {event_type} event for channel {channel.name}: {e}",
                exc_info=True
            )
            return None


# Global client instance
parser_client = ParserMicroserviceClient()
