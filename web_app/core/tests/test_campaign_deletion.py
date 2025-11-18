"""
CHANGE: Tests for campaign deletion validation
WHY: Ensure campaigns with publications cannot be deleted
REF: issue #42
"""
import pytest
from django.test import TransactionTestCase, RequestFactory
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.contrib.auth import get_user_model

from .factories import (
    CampaignFactory,
    CampaignChannelFactory,
    ChannelFactory,
    ChannelAdminFactory,
)
from ..models import Campaign, CampaignChannel
from ..admin import CampaignAdmin

User = get_user_model()
pytestmark = [pytest.mark.django_db]


class CampaignDeletionTestCase(TransactionTestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.site = AdminSite()
        self.admin = CampaignAdmin(Campaign, self.site)
        self.superuser = User.objects.create_superuser(
            username='admin', email='admin@test.com', password='password'
        )

    def _get_request(self, user=None):
        """Helper to create request with messages middleware"""
        request = self.factory.get('/')
        request.user = user or self.superuser
        # Add messages middleware
        setattr(request, 'session', 'session')
        messages = FallbackStorage(request)
        setattr(request, '_messages', messages)
        return request

    def test_has_publications_returns_false_for_no_publications(self):
        """Test has_publications() returns False when campaign has no publications"""
        campaign = CampaignFactory()
        channel = ChannelFactory()
        channel_admin = ChannelAdminFactory()

        # Create campaign_channel without PUBLISHED status
        CampaignChannelFactory(
            campaign=campaign,
            channel=channel,
            channel_admin=channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED
        )

        self.assertFalse(campaign.has_publications())

    def test_has_publications_returns_true_for_published_posts(self):
        """Test has_publications() returns True when campaign has published posts"""
        campaign = CampaignFactory()
        channel = ChannelFactory()
        channel_admin = ChannelAdminFactory()

        # Create campaign_channel and manually set PUBLISHED status
        # (factory/signals may override, so we update after creation)
        campaign_channel = CampaignChannelFactory(
            campaign=campaign,
            channel=channel,
            channel_admin=channel_admin
        )
        campaign_channel.publish_status = CampaignChannel.PublishStatusChoices.PUBLISHED
        campaign_channel.save()

        self.assertTrue(campaign.has_publications())

    def test_delete_model_prevents_deletion_with_publications(self):
        """Test delete_model() prevents deletion when campaign has publications"""
        campaign = CampaignFactory()
        channel = ChannelFactory()
        channel_admin = ChannelAdminFactory()

        campaign_channel = CampaignChannelFactory(
            campaign=campaign,
            channel=channel,
            channel_admin=channel_admin
        )
        campaign_channel.publish_status = CampaignChannel.PublishStatusChoices.PUBLISHED
        campaign_channel.save()

        request = self._get_request()
        self.admin.delete_model(request, campaign)

        # Campaign should still exist
        self.assertTrue(Campaign.objects.filter(id=campaign.id).exists())

    def test_delete_model_allows_deletion_without_publications(self):
        """Test delete_model() allows deletion when campaign has no publications"""
        campaign = CampaignFactory()
        channel = ChannelFactory()
        channel_admin = ChannelAdminFactory()

        CampaignChannelFactory(
            campaign=campaign,
            channel=channel,
            channel_admin=channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED
        )

        request = self._get_request()
        campaign_id = campaign.id
        self.admin.delete_model(request, campaign)

        # Campaign should be deleted
        self.assertFalse(Campaign.objects.filter(id=campaign_id).exists())

    def test_delete_queryset_prevents_deletion_of_campaigns_with_publications(self):
        """Test delete_queryset() prevents bulk deletion of campaigns with publications"""
        # Campaign with publications
        campaign1 = CampaignFactory()
        channel1 = ChannelFactory()
        channel_admin1 = ChannelAdminFactory()
        cc1 = CampaignChannelFactory(
            campaign=campaign1,
            channel=channel1,
            channel_admin=channel_admin1
        )
        cc1.publish_status = CampaignChannel.PublishStatusChoices.PUBLISHED
        cc1.save()

        # Campaign without publications
        campaign2 = CampaignFactory()
        channel2 = ChannelFactory()
        channel_admin2 = ChannelAdminFactory()
        CampaignChannelFactory(
            campaign=campaign2,
            channel=channel2,
            channel_admin=channel_admin2,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED
        )

        # Verify that campaign1 actually has publications before trying to delete
        cc1.refresh_from_db()
        self.assertEqual(cc1.publish_status, CampaignChannel.PublishStatusChoices.PUBLISHED)
        self.assertTrue(campaign1.has_publications())

        request = self._get_request()
        queryset = Campaign.objects.filter(id__in=[campaign1.id, campaign2.id])
        self.admin.delete_queryset(request, queryset)

        # Campaign with publications should still exist
        self.assertTrue(Campaign.objects.filter(id=campaign1.id).exists())
        # Campaign without publications should be deleted
        self.assertFalse(Campaign.objects.filter(id=campaign2.id).exists())

    def test_delete_queryset_allows_deletion_when_no_publications(self):
        """Test delete_queryset() allows deletion when no campaigns have publications"""
        campaign1 = CampaignFactory()
        campaign2 = CampaignFactory()

        request = self._get_request()
        queryset = Campaign.objects.filter(id__in=[campaign1.id, campaign2.id])
        self.admin.delete_queryset(request, queryset)

        # Both campaigns should be deleted
        self.assertFalse(Campaign.objects.filter(id=campaign1.id).exists())
        self.assertFalse(Campaign.objects.filter(id=campaign2.id).exists())

    def test_has_publications_with_multiple_statuses(self):
        """Test has_publications() only counts PUBLISHED status"""
        campaign = CampaignFactory()
        channel1 = ChannelFactory()
        channel2 = ChannelFactory()
        channel3 = ChannelFactory()
        channel_admin = ChannelAdminFactory()

        # Create campaign_channels with different statuses
        CampaignChannelFactory(
            campaign=campaign,
            channel=channel1,
            channel_admin=channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED
        )
        CampaignChannelFactory(
            campaign=campaign,
            channel=channel2,
            channel_admin=channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.CONFIRMED
        )
        cc3 = CampaignChannelFactory(
            campaign=campaign,
            channel=channel3,
            channel_admin=channel_admin
        )
        cc3.publish_status = CampaignChannel.PublishStatusChoices.DELETED
        cc3.save()

        # Should be False as no PUBLISHED status
        self.assertFalse(campaign.has_publications())

        # Add one PUBLISHED
        channel4 = ChannelFactory()
        cc4 = CampaignChannelFactory(
            campaign=campaign,
            channel=channel4,
            channel_admin=channel_admin
        )
        cc4.publish_status = CampaignChannel.PublishStatusChoices.PUBLISHED
        cc4.save()

        # Now should be True
        self.assertTrue(campaign.has_publications())
