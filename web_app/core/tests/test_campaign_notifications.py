from decimal import Decimal
from unittest import mock

from django.core.exceptions import ValidationError
from django.test import TestCase

from core.models import Campaign, CampaignChannel
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

    @mock.patch("core.signals.send_message_to_channel_admin")
    @mock.patch("core.models.CampaignChannel.send_approval_request")
    def test_notifications_sent_once_on_exit_from_draft(self, notify_mock, _send_signal_mock):
        campaign = CampaignFactory(
            status=Campaign.Statuses.DRAFT,
            budget=Decimal("100000.00"),
            message=MessageFactory(buttons=[{"text": "Go", "url": "https://go"}]),
        )
        CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED,
            is_approved=False,
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

    @mock.patch("core.signals.send_message_to_channel_admin")
    def test_archived_campaign_does_not_trigger_notifications(self, post_mock):
        campaign = CampaignFactory(is_archived=True, status=Campaign.Statuses.ACTIVE)
        CampaignChannelFactory(
            campaign=campaign,
            channel=self.channel,
            channel_admin=self.channel_admin,
            publish_status=CampaignChannel.PublishStatusChoices.PLANNED,
            is_approved=False,
        )

        self.assertFalse(post_mock.called)
