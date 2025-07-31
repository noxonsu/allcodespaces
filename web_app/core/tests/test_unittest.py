from unittest import TestCase

import pytest

from .conftest import create_campaign_channel
from .factories import ChannelAdminFactory, MessageFactory, CampaignFactory, CampaignChannelFactory, ChannelFactory
from ..models import Message
from faker import  Faker

faker = Faker()

pytestmark = [
    pytest.mark.django_db
]

class TestUnitTest(TestCase):
    def test_create_channel_admin_with_user(self):
        channel_admin = ChannelAdminFactory.create()
        assert channel_admin.user is not None

    def test_link_message_is_stats_true_success(self):
        url = '/api/campaign-channel/{id}/click/'
        campaign_channel = create_campaign_channel(is_stats=True)
        self.assertEqual(campaign_channel.path_click_analysis, url.format(id=campaign_channel.id))

    def test_link_message_is_stats_false_success(self):
        campaign_channel = create_campaign_channel(is_stats=False)
        self.assertEqual(campaign_channel.path_click_analysis, campaign_channel.campaign.message.button_link)


