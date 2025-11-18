from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from core.models import CampaignChannel, PlacementFormat
from core.tests.factories import CampaignChannelFactory, CampaignFactory, ChannelAdminFactory, ChannelFactory, MessageFactory


class CampaignChannelButtonClicksTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.channel_admin = ChannelAdminFactory(is_bot_installed=True)
        self.channel = ChannelFactory(is_deleted=False)
        self.channel_admin.channels.add(self.channel)

        self.message = MessageFactory(
            format=PlacementFormat.FIXED_SLOT,
            buttons=[
                {"text": "One", "url": "https://one"},
                {"text": "Two", "url": "https://two"},
            ],
        )
        self.campaign = CampaignFactory(format=PlacementFormat.FIXED_SLOT, message=self.message, status="active")
        self.campaign_channel: CampaignChannel = CampaignChannelFactory(
            campaign=self.campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
        )

    def test_clicks_increment_by_button_index(self):
        url = reverse("core:campaignchannel-click", args=[self.campaign_channel.id])

        r1 = self.client.get(url, {"button_index": 1})
        self.assertEqual(r1.status_code, 301)
        r2 = self.client.get(url, {"button_index": 1})
        self.assertEqual(r2.status_code, 301)

        self.campaign_channel.refresh_from_db()
        self.assertEqual(self.campaign_channel.clicks, 2)
        self.assertEqual(self.campaign_channel.button_clicks.get("1"), 2)
        # first button untouched
        self.assertIsNone(self.campaign_channel.button_clicks.get("0"))
