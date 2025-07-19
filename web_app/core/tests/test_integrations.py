from unittest.mock import patch

from django.test import TestCase

from core.external_clients import TGStatClient
from .factories import CampaignFactory, ChannelFactory, ChannelAdminFactory, MessageFactory
from .factories import CampaignChannelFactory
from core.models import Campaign, CampaignChannel, Channel, ChannelAdmin, Message
from core.external_clients import TGChannelStat


# class TestCampaignIntegrationTests(TestCase):
#
#     def test_get_active_campaigns_success(self):
#         CampaignFactory.create_batch(5, status='active')
#         CampaignFactory.create_batch(10, status='paused')
#
#         self.assertEqual(Campaign.objects.active().count(), 5)
#         self.assertEqual(Campaign.objects.paused().count(), 10)
#         self.assertEqual(Campaign.objects.all().count(), 15)
#
#     def test_cls_campaign_alter_activity(self):
#         aa = CampaignChannelFactory(cpm=1000, impressions_fact=1000, campaign__budget=500, campaign__name='A', campaign__status='active')
#         CampaignChannelFactory(cpm=200, impressions_fact=2000, campaign=aa.campaign, campaign__budget=50)
#         CampaignChannelFactory(cpm=20, impressions_fact=200, campaign__budget=300, campaign__name='B', campaign__status='active')
#         CampaignChannelFactory(cpm=30, impressions_fact=20, campaign__budget=30000, campaign__name='C', campaign__status='active')
#         updated_count = CampaignChannel.cls_alter_campaign_activity()
#         self.assertEqual(updated_count, 2)
#
#
class TestTGStatTests(TestCase):
    def setUp(self):
        self.client = TGStatClient()

    def test_channel_info(self):
        channel: Channel = ChannelFactory.create(tg_id='-1002176577290', name='ЭксперТУШка')
        response = self.client.update_channel_info(channel)
        self.assertEqual(response, channel)

    @patch('core.signals.send_message_to_channel_admin', return_value=True, autospec=True)
    def test_update_channel_post_stats(self, signal_patched):
        channel: Channel = ChannelFactory.create(tg_id='-1002176577290', name='ЭксперТУШка')
        channel_admin: ChannelAdmin = ChannelAdminFactory.create()
        message: Message = MessageFactory.create()
        campaign: Campaign = CampaignFactory.create(message=message)
        channel.admins.add(channel_admin)
        channel_campaign: CampaignChannel = channel.channel_campaigns.create(
            channel=channel,
            campaign=campaign,
            channel_admin=channel_admin,
            channel_post_id=363,
            cpm=1
        )
        signal_patched.assert_called_once()
        self.assertEqual(signal_patched.call_count, 1)
        campaign.channels.add(channel)
        self.client.update_message_views(channel_campaign)
        self.assertNotEqual(channel_campaign.impressions_fact, 0)
        self.assertIsNotNone(channel_campaign.impressions_fact)

    @patch.object(TGChannelStat, 'save', return_value=True, autospec=True)
    def test_tg_update_channel_stat(self, pathed_save):
        channel: Channel = ChannelFactory.create(tg_id='-1002176577290', name='ЭксперТУШка')
        self.client.update_channel_stat(channel)
        pathed_save.assert_called_once()