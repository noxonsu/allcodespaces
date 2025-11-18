"""
CHANGE: Added tests for microservice webhook integration
WHY: Required by ТЗ 4.1.1 - ensure webhook notifications work correctly
QUOTE(ТЗ): "покрыть модульными тестами"
REF: issue #45
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
import requests

from core.models import Channel
from core.webhook_client import ParserMicroserviceClient, ChannelEventType
from core.tests.factories import ChannelFactory


class WebhookClientTests(TestCase):
    """Tests for ParserMicroserviceClient"""

    def setUp(self):
        self.channel = ChannelFactory(is_deleted=False)

    @patch('core.webhook_client.app_settings')
    @patch('core.webhook_client.requests.Session.post')
    def test_send_channel_added_event(self, mock_post, mock_settings):
        """Test sending channel_added event"""
        mock_settings.PARSER_MICROSERVICE_URL = "http://parser.local"
        mock_settings.PARSER_MICROSERVICE_API_KEY = "test_key"
        mock_settings.PARSER_MICROSERVICE_ENABLED = True

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.text = "OK"
        mock_post.return_value = mock_response

        client = ParserMicroserviceClient()
        response = client.send_channel_event(self.channel, ChannelEventType.CHANNEL_ADDED)

        self.assertIsNotNone(response)
        mock_post.assert_called_once()

        # Check payload structure
        call_args = mock_post.call_args
        payload = call_args.kwargs['json']
        self.assertEqual(payload['event_type'], 'channel_added')
        self.assertEqual(payload['channel']['tg_id'], self.channel.tg_id)
        self.assertEqual(payload['channel']['name'], self.channel.name)
        self.assertFalse(payload['channel']['is_deleted'])

    @patch('core.webhook_client.app_settings')
    @patch('core.webhook_client.requests.Session.post')
    def test_send_channel_deleted_event(self, mock_post, mock_settings):
        """Test sending channel_deleted event"""
        mock_settings.PARSER_MICROSERVICE_URL = "http://parser.local"
        mock_settings.PARSER_MICROSERVICE_API_KEY = ""
        mock_settings.PARSER_MICROSERVICE_ENABLED = True

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        self.channel.is_deleted = True
        client = ParserMicroserviceClient()
        response = client.send_channel_event(self.channel, ChannelEventType.CHANNEL_DELETED)

        self.assertIsNotNone(response)
        payload = mock_post.call_args.kwargs['json']
        self.assertEqual(payload['event_type'], 'channel_deleted')
        self.assertTrue(payload['channel']['is_deleted'])

    @patch('core.webhook_client.app_settings')
    @patch('core.webhook_client.requests.Session.post')
    def test_webhook_disabled(self, mock_post, mock_settings):
        """Test that webhook is not sent when disabled"""
        mock_settings.PARSER_MICROSERVICE_ENABLED = False

        client = ParserMicroserviceClient()
        response = client.send_channel_event(self.channel, ChannelEventType.CHANNEL_ADDED)

        self.assertIsNone(response)
        mock_post.assert_not_called()

    @patch('core.webhook_client.app_settings')
    @patch('core.webhook_client.requests.Session.post')
    def test_api_key_in_headers(self, mock_post, mock_settings):
        """Test that API key is included in request headers"""
        mock_settings.PARSER_MICROSERVICE_URL = "http://parser.local"
        mock_settings.PARSER_MICROSERVICE_API_KEY = "secret_key"
        mock_settings.PARSER_MICROSERVICE_ENABLED = True

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        client = ParserMicroserviceClient()
        client.send_channel_event(self.channel, ChannelEventType.CHANNEL_ADDED)

        headers = mock_post.call_args.kwargs['headers']
        self.assertEqual(headers['Authorization'], 'Bearer secret_key')

    @patch('core.webhook_client.app_settings')
    @patch('core.webhook_client.requests.Session.post')
    def test_request_timeout(self, mock_post, mock_settings):
        """Test handling of request timeout"""
        mock_settings.PARSER_MICROSERVICE_URL = "http://parser.local"
        mock_settings.PARSER_MICROSERVICE_ENABLED = True

        mock_post.side_effect = requests.exceptions.Timeout("Timeout")

        client = ParserMicroserviceClient()
        response = client.send_channel_event(self.channel, ChannelEventType.CHANNEL_ADDED)

        self.assertIsNone(response)

    @patch('core.webhook_client.app_settings')
    @patch('core.webhook_client.requests.Session.post')
    def test_http_error(self, mock_post, mock_settings):
        """Test handling of HTTP errors"""
        mock_settings.PARSER_MICROSERVICE_URL = "http://parser.local"
        mock_settings.PARSER_MICROSERVICE_ENABLED = True

        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("Server Error")
        mock_post.return_value = mock_response

        client = ParserMicroserviceClient()
        response = client.send_channel_event(self.channel, ChannelEventType.CHANNEL_ADDED)

        self.assertIsNone(response)


class ChannelSignalTests(TestCase):
    """Tests for Channel signals triggering webhook notifications"""

    @patch('core.webhook_client.parser_client.send_channel_event')
    def test_signal_on_channel_create(self, mock_send):
        """Test that webhook is sent when channel is created"""
        channel = ChannelFactory()

        mock_send.assert_called_once()
        args = mock_send.call_args
        self.assertEqual(args[0][0].tg_id, channel.tg_id)
        self.assertEqual(args[0][1], ChannelEventType.CHANNEL_ADDED)

    @patch('core.webhook_client.parser_client.send_channel_event')
    def test_signal_on_channel_soft_delete(self, mock_send):
        """Test that webhook is sent when channel is soft deleted"""
        channel = ChannelFactory(is_deleted=False)
        mock_send.reset_mock()

        # Soft delete the channel
        channel.is_deleted = True
        channel.save()

        # Should have called webhook
        self.assertTrue(mock_send.called)
        # Get the last call (might be multiple due to other saves)
        last_call = mock_send.call_args
        self.assertEqual(last_call[0][1], ChannelEventType.CHANNEL_DELETED)

    @patch('core.webhook_client.parser_client.send_channel_event')
    def test_signal_on_channel_restore(self, mock_send):
        """Test that webhook is sent when deleted channel is restored"""
        channel = ChannelFactory(is_deleted=True)
        mock_send.reset_mock()

        # Restore the channel
        channel.is_deleted = False
        channel.save()

        # Should have called webhook
        self.assertTrue(mock_send.called)
        last_call = mock_send.call_args
        self.assertEqual(last_call[0][1], ChannelEventType.CHANNEL_RESTORED)

    @patch('core.webhook_client.parser_client.send_channel_event')
    def test_no_signal_on_normal_update(self, mock_send):
        """Test that webhook is not sent on normal updates (не is_deleted изменения)"""
        channel = ChannelFactory(is_deleted=False)
        mock_send.reset_mock()

        # Update name (не is_deleted)
        channel.name = "New Name"
        channel.save(update_fields=['name'])

        # Should not call webhook for is_deleted changes
        mock_send.assert_not_called()
