"""
Tests to verify that preview functionality doesn't affect campaign statistics.

CHANGE: Added tests to verify preview doesn't affect statistics
WHY: Issue #53 requires verification that previews don't impact reporting
REF: #53
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import MessagePreviewToken, CampaignChannel
from core.tests.factories import (
    MessageFactory,
    UserFactory,
    CampaignFactory,
    ChannelFactory,
    CampaignChannelFactory,
)


class PreviewStatisticsTests(TestCase):
    """Test that previews don't affect campaign statistics."""

    def setUp(self):
        self.client = APIClient()
        self.user = UserFactory(is_staff=True, is_superuser=True)
        self.message = MessageFactory()
        self.campaign = CampaignFactory(message=self.message)
        self.channel = ChannelFactory()
        self.campaign_channel = CampaignChannelFactory(
            campaign=self.campaign,
            channel=self.channel,
            clicks=10,
            impressions_fact=1000,
            publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED,
        )

    def test_preview_does_not_create_campaign_channel(self):
        """Preview token creation should not create CampaignChannel."""
        initial_count = CampaignChannel.objects.count()

        # Create preview token
        token = MessagePreviewToken.objects.create(
            token="test-token",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        # Verify no new CampaignChannel created
        self.assertEqual(CampaignChannel.objects.count(), initial_count)

    def test_preview_resolve_does_not_affect_statistics(self):
        """Resolving preview token should not modify campaign statistics."""
        # Create preview token
        token = MessagePreviewToken.objects.create(
            token="test-token-stats",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        # Get initial statistics
        initial_clicks = self.campaign_channel.clicks
        initial_impressions = self.campaign_channel.impressions_fact
        initial_total_clicks = self.campaign.total_clicks
        initial_total_impressions = self.campaign.total_impressions_fact

        # Resolve preview token (simulate bot usage)
        self.client.force_authenticate(user=None)  # No auth required for resolve
        response = self.client.post(
            "/api/message/preview/resolve/", {"token": token.token}, format="json"
        )

        self.assertEqual(response.status_code, 200)

        # Refresh from DB
        self.campaign_channel.refresh_from_db()
        self.campaign.refresh_from_db()

        # Verify statistics unchanged
        self.assertEqual(self.campaign_channel.clicks, initial_clicks)
        self.assertEqual(self.campaign_channel.impressions_fact, initial_impressions)
        self.assertEqual(self.campaign.total_clicks, initial_total_clicks)
        self.assertEqual(self.campaign.total_impressions_fact, initial_total_impressions)

    def test_multiple_previews_do_not_accumulate_statistics(self):
        """Multiple preview token usages should not accumulate statistics."""
        initial_clicks = self.campaign_channel.clicks
        initial_impressions = self.campaign_channel.impressions_fact

        # Create and use 5 preview tokens
        for i in range(5):
            token = MessagePreviewToken.objects.create(
                token=f"test-token-{i}",
                message=self.message,
                created_by=self.user,
                expires_at=timezone.now() + timedelta(minutes=30),
            )

            # Resolve token
            response = self.client.post(
                "/api/message/preview/resolve/", {"token": token.token}, format="json"
            )
            self.assertEqual(response.status_code, 200)

        # Refresh from DB
        self.campaign_channel.refresh_from_db()

        # Statistics should remain unchanged
        self.assertEqual(self.campaign_channel.clicks, initial_clicks)
        self.assertEqual(self.campaign_channel.impressions_fact, initial_impressions)

    def test_preview_tokens_are_logged_separately(self):
        """Preview tokens should be logged in MessagePreviewToken, not in CampaignChannel."""
        # Create preview token
        token = MessagePreviewToken.objects.create(
            token="test-token-logging",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        # Resolve token
        response = self.client.post(
            "/api/message/preview/resolve/", {"token": token.token}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        # Verify token is marked as used
        token.refresh_from_db()
        self.assertIsNotNone(token.used_at)

        # Verify this is logged in preview tokens table
        preview_logs = MessagePreviewToken.objects.filter(message=self.message)
        self.assertEqual(preview_logs.count(), 1)
        self.assertEqual(preview_logs.first().token, "test-token-logging")

    def test_campaign_reports_exclude_preview_tokens(self):
        """Campaign reports should only include CampaignChannel data, not preview tokens."""
        # Create several preview tokens
        for i in range(3):
            MessagePreviewToken.objects.create(
                token=f"preview-token-{i}",
                message=self.message,
                created_by=self.user,
                expires_at=timezone.now() + timedelta(minutes=30),
                used_at=timezone.now(),  # Mark as used
            )

        # Get campaign statistics
        total_clicks = self.campaign.total_clicks

        # Verify preview tokens are not counted in campaign statistics
        self.assertEqual(total_clicks, 10)  # From setUp - only CampaignChannel clicks

        # Verify preview tokens exist but are separate from campaign stats
        preview_count = MessagePreviewToken.objects.filter(
            message=self.message, used_at__isnull=False
        ).count()
        self.assertEqual(preview_count, 3)

        # Verify no preview token data leaks into CampaignChannel table
        campaign_channel_count = CampaignChannel.objects.filter(
            campaign=self.campaign
        ).count()
        self.assertEqual(campaign_channel_count, 1)  # Only the one from setUp


class PreviewTokenHistoryTests(TestCase):
    """Test preview token history functionality."""

    def setUp(self):
        self.user = UserFactory(is_staff=True, is_superuser=True)
        self.message = MessageFactory()

    def test_preview_token_history_accessible(self):
        """Preview tokens should be accessible via message's related name."""
        # Create preview tokens
        token1 = MessagePreviewToken.objects.create(
            token="token-1",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        token2 = MessagePreviewToken.objects.create(
            token="token-2",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
            used_at=timezone.now(),
        )

        # Access history via related name
        history = self.message.preview_tokens.all()
        self.assertEqual(history.count(), 2)
        self.assertIn(token1, history)
        self.assertIn(token2, history)

    def test_preview_token_status_properties(self):
        """Test status properties of preview tokens."""
        # Active token
        active_token = MessagePreviewToken.objects.create(
            token="active",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
        )
        self.assertFalse(active_token.is_used)
        self.assertFalse(active_token.is_expired)

        # Used token
        used_token = MessagePreviewToken.objects.create(
            token="used",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
            used_at=timezone.now(),
        )
        self.assertTrue(used_token.is_used)
        self.assertFalse(used_token.is_expired)

        # Expired token
        expired_token = MessagePreviewToken.objects.create(
            token="expired",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.assertFalse(expired_token.is_used)
        self.assertTrue(expired_token.is_expired)

    def test_preview_history_ordering(self):
        """Preview tokens should be ordered by creation date (newest first)."""
        # Create tokens with different timestamps
        old_token = MessagePreviewToken.objects.create(
            token="old",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        # Simulate time passing
        import time

        time.sleep(0.1)

        new_token = MessagePreviewToken.objects.create(
            token="new",
            message=self.message,
            created_by=self.user,
            expires_at=timezone.now() + timedelta(minutes=30),
        )

        # Get history
        history = self.message.preview_tokens.all()

        # Should be ordered newest first
        self.assertEqual(history.first(), new_token)
        self.assertEqual(history.last(), old_token)
