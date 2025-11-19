from unittest import mock

from django.core.exceptions import ValidationError
from django.test import TestCase

from core.models import Campaign
from core.tests.factories import (
    CampaignChannelFactory,
    CampaignFactory,
    ChannelAdminFactory,
    ChannelFactory,
    MessageFactory,
)


class CampaignNotificationTests(TestCase):
    def setUp(self):
        self.channel_admin = ChannelAdminFactory(is_bot_installed=True)
        self.channel = ChannelFactory(auto_approve_publications=False, is_deleted=False)
        self.channel_admin.channels.add(self.channel)

    @mock.patch("core.models.CampaignChannel.send_approval_request")
    def test_notifications_sent_once_on_exit_from_draft(self, notify_mock):
        campaign = CampaignFactory(
            status=Campaign.Statuses.DRAFT,
            message=MessageFactory(buttons=[{"text": "Go", "url": "https://go"}]),
        )
        CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
            publish_status="planned",
        )

        campaign.status = Campaign.Statuses.ACTIVE
        campaign.full_clean()
        campaign.save(update_fields=["status"])

        campaign.status = Campaign.Statuses.PAUSED
        campaign.full_clean()
        campaign.save(update_fields=["status"])

        notify_mock.assert_called_once()

    def test_buttons_validation_fixed_slot(self):
        campaign = CampaignFactory(format="fixed_slot")
        campaign.message.buttons = []
        with self.assertRaises(ValidationError):
            campaign.message.full_clean()
