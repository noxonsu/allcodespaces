from unittest import mock
from datetime import time

from django.test import TestCase
from django.utils import timezone

from core.models import CampaignChannel, PlacementFormat
from core.signals import send_message_to_channel_admin
from core.tests.factories import (
    CampaignChannelFactory,
    CampaignFactory,
    ChannelAdminFactory,
    ChannelFactory,
    ChannelPublicationSlotFactory,
    MessageFactory,
)


class NotificationPayloadTests(TestCase):
    def setUp(self):
        self.channel_admin = ChannelAdminFactory(is_bot_installed=True)
        self.channel = ChannelFactory(require_manual_approval=True, is_deleted=False)
        self.channel_admin.channels.add(self.channel)
        self.slot = ChannelPublicationSlotFactory(
            channel=self.channel,
            weekday=timezone.now().weekday(),
            start_time=time(10, 0),
            end_time=time(11, 0),
        )

    @mock.patch("core.signals.requests.post")
    def test_payload_contains_format_schedule_and_buttons(self, post_mock):
        campaign = CampaignFactory(
            status="active",
            format=PlacementFormat.FIXED_SLOT,
            start_date=timezone.now().date(),
            finish_date=timezone.now().date(),
            message=MessageFactory(
                format=PlacementFormat.FIXED_SLOT,
                buttons=[
                    {"text": "One", "url": "https://one"},
                    {"text": "Two", "url": "https://two"},
                ],
            ),
        )

        campaign_channel: CampaignChannel = CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
            publication_slot=self.slot,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED,
        )

        send_message_to_channel_admin(campaign_channel)

        self.assertTrue(post_mock.called)
        _, kwargs = post_mock.call_args
        sent_json = kwargs.get("data")
        self.assertIsNotNone(sent_json)
        payload = sent_json.decode()
        self.assertIn("campaign_format", payload)
        self.assertIn("scheduled_at", payload)
        self.assertIn("https://one", payload)
        self.assertIn(campaign.format, payload)
