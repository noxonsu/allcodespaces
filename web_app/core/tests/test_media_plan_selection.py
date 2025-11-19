"""
Tests for media plan campaign selection functionality.

CHANGE: Added tests for media plan selection
WHY: Issue #48 requires campaign selection for media plan generation
REF: #48
"""
from django.test import TestCase
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory
from rest_framework.test import APIClient

from core.admin import CampaignAdmin
from core.models import Campaign
from core.tests.factories import CampaignFactory, UserFactory, MessageFactory


class MediaPlanAdminActionTests(TestCase):
    """Test admin action for media plan generation."""

    def setUp(self):
        self.factory = RequestFactory()
        self.user = UserFactory(is_staff=True, is_superuser=True)
        self.site = AdminSite()
        self.campaign_admin = CampaignAdmin(Campaign, self.site)

    def test_generate_media_plan_action_exists(self):
        """Admin should have generate_media_plan action."""
        request = self.factory.get('/admin/core/campaign/')
        request.user = self.user
        actions = self.campaign_admin.get_actions(request)
        self.assertIn('generate_media_plan', actions)

    def test_generate_media_plan_with_campaigns(self):
        """Action should store campaign IDs in session."""
        # Create campaigns
        message = MessageFactory()
        campaigns = [
            CampaignFactory(message=message),
            CampaignFactory(message=message),
            CampaignFactory(message=message),
        ]

        # Create request
        request = self.factory.post('/admin/core/campaign/')
        request.user = self.user
        request.session = {}
        request._messages = FallbackStorage(request)

        # Execute action
        queryset = Campaign.objects.filter(id__in=[c.id for c in campaigns])
        self.campaign_admin.generate_media_plan(request, queryset)

        # Check session
        self.assertIn('media_plan_campaign_ids', request.session)
        self.assertEqual(len(request.session['media_plan_campaign_ids']), 3)

    def test_generate_media_plan_with_no_campaigns(self):
        """Action should show error message when no campaigns selected."""
        request = self.factory.post('/admin/core/campaign/')
        request.user = self.user
        request.session = {}
        request._messages = FallbackStorage(request)

        # Execute action with empty queryset
        queryset = Campaign.objects.none()
        self.campaign_admin.generate_media_plan(request, queryset)

        # Should not create session data
        self.assertNotIn('media_plan_campaign_ids', request.session)

    def test_generate_media_plan_action_description(self):
        """Action should have correct description."""
        self.assertEqual(
            self.campaign_admin.generate_media_plan.short_description,
            "Сформировать медиаплан"
        )


class MediaPlanAPITests(TestCase):
    """Test API endpoint for media plan generation."""

    def setUp(self):
        self.client = APIClient()
        self.user = UserFactory(is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=self.user)
        self.url = "/api/campaign/generate-media-plan/"

    def test_generate_media_plan_endpoint_exists(self):
        """Endpoint should be accessible."""
        response = self.client.post(self.url, {}, format='json')
        # Should return 400 (missing campaign_ids), not 404
        self.assertNotEqual(response.status_code, 404)

    def test_generate_media_plan_with_valid_campaigns(self):
        """Endpoint should accept valid campaign IDs."""
        message = MessageFactory()
        campaigns = [
            CampaignFactory(message=message),
            CampaignFactory(message=message),
        ]

        response = self.client.post(
            self.url,
            {'campaign_ids': [str(c.id) for c in campaigns]},
            format='json'
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['status'], 'success')
        self.assertEqual(data['campaign_count'], 2)
        self.assertEqual(len(data['campaign_ids']), 2)

    def test_generate_media_plan_without_campaign_ids(self):
        """Endpoint should return error when campaign_ids missing."""
        response = self.client.post(self.url, {}, format='json')

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data['status'], 'error')
        self.assertIn('ID кампаний', data['message'])

    def test_generate_media_plan_with_empty_list(self):
        """Endpoint should return error when campaign_ids is empty."""
        response = self.client.post(
            self.url,
            {'campaign_ids': []},
            format='json'
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data['status'], 'error')

    def test_generate_media_plan_with_nonexistent_campaigns(self):
        """Endpoint should return error when campaigns not found."""
        response = self.client.post(
            self.url,
            {'campaign_ids': ['00000000-0000-0000-0000-000000000000']},
            format='json'
        )

        self.assertEqual(response.status_code, 404)
        data = response.json()
        self.assertEqual(data['status'], 'error')
        self.assertIn('не найдены', data['message'])

    def test_generate_media_plan_excludes_archived(self):
        """Endpoint should exclude archived campaigns."""
        message = MessageFactory()
        active_campaign = CampaignFactory(message=message, is_archived=False)
        archived_campaign = CampaignFactory(message=message, is_archived=True)

        response = self.client.post(
            self.url,
            {'campaign_ids': [str(active_campaign.id), str(archived_campaign.id)]},
            format='json'
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Should only include active campaign
        self.assertEqual(data['campaign_count'], 1)
        self.assertIn(str(active_campaign.id), [str(id) for id in data['campaign_ids']])
        self.assertNotIn(str(archived_campaign.id), [str(id) for id in data['campaign_ids']])

    def test_generate_media_plan_requires_authentication(self):
        """Endpoint should require authentication."""
        self.client.force_authenticate(user=None)

        message = MessageFactory()
        campaign = CampaignFactory(message=message)

        response = self.client.post(
            self.url,
            {'campaign_ids': [str(campaign.id)]},
            format='json'
        )

        self.assertIn(response.status_code, [401, 403])


class MediaPlanSelectionIntegrationTests(TestCase):
    """Integration tests for media plan selection workflow."""

    def setUp(self):
        self.client = APIClient()
        self.user = UserFactory(is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=self.user)

    def test_end_to_end_campaign_selection(self):
        """Test complete workflow from selection to API call."""
        message = MessageFactory()
        campaigns = [
            CampaignFactory(message=message, name="Campaign 1"),
            CampaignFactory(message=message, name="Campaign 2"),
            CampaignFactory(message=message, name="Campaign 3"),
        ]

        # Step 1: Select campaigns via admin action (simulated)
        campaign_ids = [str(c.id) for c in campaigns]

        # Step 2: Call API endpoint
        response = self.client.post(
            "/api/campaign/generate-media-plan/",
            {'campaign_ids': campaign_ids},
            format='json'
        )

        # Verify response
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['campaign_count'], 3)
        self.assertIn('note', data)  # Should mention issue #49
        self.assertIn('#49', data['note'])

    def test_mixed_campaigns_selection(self):
        """Test selection with mix of active and archived campaigns."""
        message = MessageFactory()
        active = [
            CampaignFactory(message=message, is_archived=False),
            CampaignFactory(message=message, is_archived=False),
        ]
        archived = [
            CampaignFactory(message=message, is_archived=True),
        ]

        all_ids = [str(c.id) for c in active + archived]

        response = self.client.post(
            "/api/campaign/generate-media-plan/",
            {'campaign_ids': all_ids},
            format='json'
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Should only include active campaigns
        self.assertEqual(data['campaign_count'], 2)
