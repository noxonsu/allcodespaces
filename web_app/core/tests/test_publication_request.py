"""
CHANGE: Added tests for publication request endpoint
WHY: Required by ТЗ 4.1.2 - ensure publication request handling works correctly
QUOTE(ТЗ): "тесты покрывают основные сценарии"
REF: issue #46
"""
from unittest.mock import patch, MagicMock
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from decimal import Decimal

from core.models import PublicationRequest, Campaign, PlacementFormat, CampaignChannel
from core.tests.factories import ChannelFactory, CampaignFactory, MessageFactory
from web_app.app_settings import app_settings


class PublicationRequestAPITests(TestCase):
    """Tests for publication request API endpoint"""

    def setUp(self):
        self.client = APIClient()
        self.api_key = "test_api_key_123"

        # Mock settings
        with patch.object(app_settings, 'PARSER_MICROSERVICE_API_KEY', self.api_key):
            self.api_key_mock = self.api_key

        # Create test data
        self.channel = ChannelFactory(
            is_deleted=False,
            supported_formats=[PlacementFormat.SPONSORSHIP, PlacementFormat.AUTOPILOT]
        )

        self.message = MessageFactory(format=PlacementFormat.SPONSORSHIP)

        self.campaign = CampaignFactory(
            status=Campaign.Statuses.ACTIVE,
            is_archived=False,
            format=PlacementFormat.SPONSORSHIP,
            message=self.message,
            budget=Decimal('1000.00')
        )

    def _make_auth_request(self, data, use_auth=True):
        """Helper to make authenticated request"""
        headers = {}
        if use_auth:
            headers['HTTP_AUTHORIZATION'] = f'Bearer {self.api_key}'

        with patch.object(app_settings, 'PARSER_MICROSERVICE_API_KEY', self.api_key):
            return self.client.post(
                '/api/publication-request/request-publication/',
                data=data,
                format='json',
                **headers
            )

    @patch('core.views.requests.post')
    def test_successful_publication_request_by_tg_id(self, mock_post):
        """Test successful publication request using tg_id"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        response = self._make_auth_request({
            'tg_id': self.channel.tg_id,
            'format': PlacementFormat.SPONSORSHIP,
            'parameters': {}
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'success')
        self.assertIn('publication_request_id', response.data)
        self.assertIn('campaign_channel_id', response.data)

        # Check database records
        pub_request = PublicationRequest.objects.get(id=response.data['publication_request_id'])
        self.assertEqual(pub_request.status, PublicationRequest.Status.SUCCESS)
        self.assertEqual(pub_request.channel, self.channel)

    @patch('core.views.requests.post')
    def test_successful_publication_request_by_channel_id(self, mock_post):
        """Test successful publication request using channel_id"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_post.return_value = mock_response

        response = self._make_auth_request({
            'channel_id': str(self.channel.id),
            'format': PlacementFormat.SPONSORSHIP,
            'parameters': {}
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'success')

    def test_no_creative_found(self):
        """Test when no suitable creative is found"""
        # Архивируем кампанию чтобы креатив не был найден
        self.campaign.is_archived = True
        self.campaign.save()

        response = self._make_auth_request({
            'tg_id': self.channel.tg_id,
            'format': PlacementFormat.SPONSORSHIP,
        })

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['status'], 'no_creative')
        self.assertIn('publication_request_id', response.data)

        # Check database record
        pub_request = PublicationRequest.objects.get(id=response.data['publication_request_id'])
        self.assertEqual(pub_request.status, PublicationRequest.Status.NO_CREATIVE)

    def test_channel_not_found(self):
        """Test when channel is not found"""
        response = self._make_auth_request({
            'tg_id': 999999999,
            'format': PlacementFormat.SPONSORSHIP,
        })

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['status'], 'error')

    def test_channel_deleted(self):
        """Test when channel is soft-deleted"""
        self.channel.is_deleted = True
        self.channel.save()

        response = self._make_auth_request({
            'tg_id': self.channel.tg_id,
            'format': PlacementFormat.SPONSORSHIP,
        })

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data['status'], 'error')

    def test_invalid_format(self):
        """Test with invalid format"""
        response = self._make_auth_request({
            'tg_id': self.channel.tg_id,
            'format': 'invalid_format',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_channel_identifier(self):
        """Test with missing channel identifier"""
        response = self._make_auth_request({
            'format': PlacementFormat.SPONSORSHIP,
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_authentication_required(self):
        """Test that authentication is required"""
        response = self._make_auth_request({
            'tg_id': self.channel.tg_id,
            'format': PlacementFormat.SPONSORSHIP,
        }, use_auth=False)

        # Without auth header, authentication should fail
        # (exact status depends on DRF settings, could be 401 or 403)
        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])

    def test_invalid_api_key(self):
        """Test with invalid API key"""
        headers = {'HTTP_AUTHORIZATION': 'Bearer wrong_key'}

        with patch.object(app_settings, 'PARSER_MICROSERVICE_API_KEY', self.api_key):
            response = self.client.post(
                '/api/publication-request/request-publication/',
                data={
                    'tg_id': self.channel.tg_id,
                    'format': PlacementFormat.SPONSORSHIP,
                },
                format='json',
                **headers
            )

        self.assertIn(response.status_code, [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN])


class CreativeSelectionServiceTests(TestCase):
    """Tests for CreativeSelectionService"""

    def setUp(self):
        self.channel = ChannelFactory(
            is_deleted=False,
            supported_formats=[PlacementFormat.SPONSORSHIP, PlacementFormat.AUTOPILOT]
        )

    def test_select_creative_format_not_supported(self):
        """Test that None is returned when channel doesn't support format"""
        from core.services import CreativeSelectionService

        campaign = CreativeSelectionService.select_creative(
            channel=self.channel,
            format=PlacementFormat.FIXED_SLOT,  # Not in supported_formats
            parameters={}
        )

        self.assertIsNone(campaign)

    def test_select_creative_no_active_campaigns(self):
        """Test when no active campaigns exist"""
        from core.services import CreativeSelectionService

        campaign = CreativeSelectionService.select_creative(
            channel=self.channel,
            format=PlacementFormat.SPONSORSHIP,
            parameters={}
        )

        self.assertIsNone(campaign)

    def test_select_creative_success(self):
        """Test successful creative selection"""
        from core.services import CreativeSelectionService

        message = MessageFactory(format=PlacementFormat.SPONSORSHIP)
        campaign = CampaignFactory(
            status=Campaign.Statuses.ACTIVE,
            is_archived=False,
            format=PlacementFormat.SPONSORSHIP,
            message=message,
            budget=Decimal('1000.00')
        )

        selected = CreativeSelectionService.select_creative(
            channel=self.channel,
            format=PlacementFormat.SPONSORSHIP,
            parameters={}
        )

        self.assertEqual(selected, campaign)

    def test_select_creative_already_published(self):
        """Test that campaign already published to channel is skipped"""
        from core.services import CreativeSelectionService

        message = MessageFactory(format=PlacementFormat.SPONSORSHIP)
        campaign = CampaignFactory(
            status=Campaign.Statuses.ACTIVE,
            is_archived=False,
            format=PlacementFormat.SPONSORSHIP,
            message=message,
            budget=Decimal('1000.00')
        )

        # Create existing publication
        CampaignChannel.objects.create(
            channel=self.channel,
            campaign=campaign,
            publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED,
        )

        selected = CreativeSelectionService.select_creative(
            channel=self.channel,
            format=PlacementFormat.SPONSORSHIP,
            parameters={}
        )

        self.assertIsNone(selected)

    def test_create_publication(self):
        """Test creating publication"""
        from core.services import CreativeSelectionService

        message = MessageFactory(format=PlacementFormat.SPONSORSHIP)
        campaign = CampaignFactory(
            status=Campaign.Statuses.ACTIVE,
            format=PlacementFormat.SPONSORSHIP,
            message=message,
            budget=Decimal('1000.00')
        )

        campaign_channel = CreativeSelectionService.create_publication(
            channel=self.channel,
            campaign=campaign,
            parameters={}
        )

        self.assertIsNotNone(campaign_channel)
        self.assertEqual(campaign_channel.channel, self.channel)
        self.assertEqual(campaign_channel.campaign, campaign)
        self.assertEqual(
            campaign_channel.publish_status,
            CampaignChannel.PublishStatusChoices.CONFIRMED
        )
