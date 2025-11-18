from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import Campaign, CampaignChannel
from core.tests.factories import (
    CampaignFactory,
    CampaignChannelFactory,
    ChannelAdminFactory,
    ChannelFactory,
    MessageFactory,
)


class CampaignDraftRestrictionAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _build_campaign_channel(self, *, status_code: str) -> CampaignChannel:
        campaign = CampaignFactory(status=status_code, message=MessageFactory())
        channel = ChannelFactory(is_deleted=False)
        channel_admin = ChannelAdminFactory()
        return CampaignChannelFactory(
            campaign=campaign,
            channel=channel,
            channel_admin=channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED,
            cpm=Decimal("10"),
            impressions_plan=10,
        )

    def test_patch_blocked_for_draft_campaign(self):
        campaign_channel = self._build_campaign_channel(status_code=Campaign.Statuses.DRAFT)

        response = self.client.patch(
            reverse("core:campaignchannel-detail", args=[campaign_channel.id]),
            {"publish_status": CampaignChannel.PublishStatusChoices.CONFIRMED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        campaign_channel.refresh_from_db()
        self.assertEqual(
            campaign_channel.publish_status,
            CampaignChannel.PublishStatusChoices.PLANNED,
        )

    def test_patch_allowed_for_active_campaign(self):
        campaign_channel = self._build_campaign_channel(status_code=Campaign.Statuses.ACTIVE)

        response = self.client.patch(
            reverse("core:campaignchannel-detail", args=[campaign_channel.id]),
            {"publish_status": CampaignChannel.PublishStatusChoices.CONFIRMED},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        campaign_channel.refresh_from_db()
        self.assertEqual(
            campaign_channel.publish_status,
            CampaignChannel.PublishStatusChoices.CONFIRMED,
        )
