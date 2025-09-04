from unittest.mock import patch

from django.contrib.auth.models import Group
from django.forms import model_to_dict
from django.test import TransactionTestCase

from core.external_clients import TGStatClient
from .factories import (
    CampaignFactory,
    ChannelFactory,
    ChannelAdminFactory,
    MessageFactory,
    CampaignChannelFactory,
)
from core.models import Campaign, CampaignChannel, Channel, ChannelAdmin, Message
from core.external_clients import TGChannelStat
from ..admin_forms import CampaignAdminForm
from ..serializers import ExporterSerializer


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


class TestTGStatTests(TransactionTestCase):
    def setUp(self):
        self.client = TGStatClient()

    def test_channel_info(self):
        channel: Channel = ChannelFactory.create(
            tg_id="-1002176577290", name="ЭксперТУШка"
        )
        response = self.client.update_channel_info(channel)
        self.assertEqual(response, channel)

    @patch(
        "core.signals.send_message_to_channel_admin", return_value=True, autospec=True
    )
    def test_update_channel_post_stats(self, signal_patched):
        channel: Channel = ChannelFactory.create(
            tg_id="-1002176577290", name="ЭксперТУШка"
        )
        channel_admin: ChannelAdmin = ChannelAdminFactory.create()
        message: Message = MessageFactory.create()
        campaign: Campaign = CampaignFactory.create(message=message)
        channel.admins.add(channel_admin)
        channel_campaign: CampaignChannel = channel.channel_campaigns.create(
            channel=channel,
            campaign=campaign,
            channel_admin=channel_admin,
            channel_post_id=363,
            cpm=1,
        )
        signal_patched.assert_called_once()
        self.assertEqual(signal_patched.call_count, 1)
        campaign.channels.add(channel)
        self.client.update_message_views(channel_campaign)
        self.assertNotEqual(channel_campaign.impressions_fact, 0)
        self.assertIsNotNone(channel_campaign.impressions_fact)

    @patch.object(TGChannelStat, "save", return_value=True, autospec=True)
    def test_tg_update_channel_stat(self, pathed_save):
        channel: Channel = ChannelFactory.create(
            tg_id="-1002176577290", name="ЭксперТУШка"
        )
        self.client.update_channel_stat(channel)
        pathed_save.assert_called_once()


class TestChannelAdmin(TransactionTestCase):
    def test_create_channel_admin_nouser_success(self):
        channel_admin = ChannelAdmin.objects.create(username="channel_admin_username")
        self.assertIsNotNone(channel_admin.user)
        self.assertEqual(channel_admin.username, channel_admin.user.username)

    def test_save_channel_admin_nouser_success(self):
        channel_admin = ChannelAdmin(username="channel_admin_username")
        channel_admin.save()
        self.assertIsNotNone(channel_admin.user)
        self.assertEqual(channel_admin.username, channel_admin.user.username)

    def test_update_channel_admin_nouser_success(self):
        channel_admin = ChannelAdminFactory(username="channel_admin_username3")
        channel_admin.first_name = "any"
        channel_admin.save()
        self.assertIsNotNone(channel_admin.user)
        self.assertEqual(channel_admin.username, channel_admin.user.username)

    def test_channel_admin_set_groups(self):
        channel_admin = ChannelAdmin.objects.create(username="channel_admin_groups")
        self.assertEqual(channel_admin.user.groups.count(), 1)
        self.assertEqual(channel_admin.user.groups.first().name, channel_admin.role)

    def test_channel_admin_user_only_onegroup(self):
        channel_admin = ChannelAdmin.objects.create(username="channel_admin_groups")
        channel_admin.role = ChannelAdmin.Role.OWNER
        channel_admin.save()
        channel_admin.role = ChannelAdmin.Role.MANAGER
        channel_admin.save()
        self.assertEqual(channel_admin.user.groups.count(), 1)
        self.assertEqual(channel_admin.user.groups.first().name, channel_admin.role)

    def test_channel_admin_different_groups_success(self):
        channel_admin1 = ChannelAdmin.objects.create(username="channel_admin_groups")
        channel_admin2 = ChannelAdmin.objects.create(username="channel_admin_groups2")

        channel_admin1.role = ChannelAdmin.Role.OWNER
        channel_admin1.save()
        channel_admin2.role = ChannelAdmin.Role.MANAGER
        channel_admin2.save()

        self.assertEqual(channel_admin1.user.groups.count(), 1)
        self.assertEqual(channel_admin1.user.groups.first().name, channel_admin1.role)

        self.assertEqual(channel_admin2.user.groups.count(), 1)
        self.assertEqual(channel_admin2.user.groups.first().name, channel_admin2.role)

        self.assertEqual(Group.objects.all().count(), 2)

    def test_channel_admin_auto_creates_user_success(self):
        channel_admin = ChannelAdmin.objects.create(
            username="channel_admin_username", tg_id="-1002176577290"
        )
        self.assertIsNotNone(channel_admin.user)
        self.assertEqual(channel_admin.user.username, channel_admin.username)
        self.assertEqual(Group.objects.all().count(), 1)
        self.assertEqual(Group.objects.all().first().name, channel_admin.role)


class TestExporter(TransactionTestCase):
    def test_qs_exporter_success(self):
        instances = CampaignChannelFactory.create_batch(size=5)
        rows = [
            i.values() for i in ExporterSerializer(instance=instances, many=True).data
        ]
        print("rows", rows)
        self.assertEqual(len(rows), 5)


class CampaignFormTestCase(TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.old_campaign = CampaignFactory.create()

    def test_create_campaign_empty_client_raises_exception(self):
        new_campaign = CampaignFactory.create(client="")
        data = model_to_dict(new_campaign, exclude=["channels"])
        form = CampaignAdminForm(data=data)
        self.assertFalse(form.is_valid())
        self.assertEqual(len(form.errors), 1)
        self.assertTrue(form.has_error("client"))

    def test_create_campaign_notempty_client_success(self):
        data = model_to_dict(self.old_campaign, exclude=["channels"])
        form = CampaignAdminForm(data=data)
        self.assertTrue(form.is_valid())
        self.assertEqual(len(form.errors), 0)
        self.assertFalse(form.has_error("client"))
