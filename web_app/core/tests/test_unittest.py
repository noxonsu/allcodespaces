from unittest import skipIf, mock
from django.test import  tag
import django.utils.timezone as timezone
import pytest
from django.core.exceptions import ValidationError
from django.test import TransactionTestCase

from .conftest import create_campaign_channel, create_owner_fn
from .factories import (
    ChannelAdminFactory,
    MessageFactory,
    CampaignFactory,
    ChannelFactory,
    UserFactory,
    CampaignChannelFactory,
    ChannelPublicationSlotFactory,
)
from ..admin_utils import is_not_valid_channel_status
from ..models import Campaign, Channel, ChannelAdmin, CampaignChannel, PlacementFormat, ChannelPublicationSlot
from ..serializers import ChannelSerializer
from faker import Faker

from ..utils import update_broken_channel_avatar

faker = Faker()

pytestmark = [pytest.mark.django_db]


class TestUnitTest(TransactionTestCase):
    def test_create_channel_admin_with_user(self):
        channel_admin = ChannelAdminFactory.create()
        assert channel_admin.user is not None

    def test_link_message_is_stats_true_success(self):
        url = "/api/campaign-channel/{id}/click/"
        campaign_channel = create_campaign_channel(is_external=False)
        self.assertEqual(
            campaign_channel.path_click_analysis, url.format(id=campaign_channel.id)
        )

    def test_link_message_is_stats_false_success(self):
        campaign_channel = create_campaign_channel(is_external=True)
        self.assertEqual(
            campaign_channel.path_click_analysis,
            campaign_channel.campaign.message.button_link,
        )

    def test_create_campaign_success(self):
        today = timezone.now().date()
        message = MessageFactory.create()

        campaign = Campaign(
            budget=faker.random_int(),
            start_date=today,
            finish_date=today,
            message=message,
        )
        campaign.clean()
        campaign.save()
        campaign.refresh_from_db()
        self.assertIsNotNone(campaign)

    def test_update_campaign_success(self):
        message = MessageFactory.create()
        campaign = CampaignFactory(message=message)
        campaign.budge = 4500
        campaign.save()
        self.assertIsNotNone(campaign)
        self.assertEqual(campaign.budge, 4500)

    def test_create_campaign_start_date_failed(self):
        message = MessageFactory.create()
        with self.assertRaises(ValidationError):
            campaign = Campaign(
                budget=faker.random_int(),
                start_date=timezone.datetime(2020, 1, 1).date(),
                finish_date=timezone.now().date(),
                message=message,
            )
            campaign.clean()
            campaign.save()
            campaign.refresh_from_db()

    def test_update_campaign_start_date_failed(self):
        message = MessageFactory.create()
        with self.assertRaises(ValidationError):
            campaign = CampaignFactory(
                budget=4500,
                start_date=timezone.now().date(),
                finish_date=timezone.now().date(),
                message=message,
            )

            campaign.start_date = timezone.datetime(2020, 1, 1).date()
            campaign.clean()
            campaign.save()

    def test_message_sponsorship_body_limit(self):
        message = MessageFactory(format=PlacementFormat.SPONSORSHIP, body="a" * 200)
        with self.assertRaises(ValidationError):
            message.clean()

    def test_campaign_requires_matching_message_format(self):
        sponsorship_message = MessageFactory(format=PlacementFormat.SPONSORSHIP)
        campaign = Campaign(
            budget=faker.random_int(),
            start_date=timezone.now().date(),
            finish_date=timezone.now().date(),
            message=sponsorship_message,
            format=PlacementFormat.FIXED_SLOT,
        )
        with self.assertRaises(ValidationError):
            campaign.clean()

    def test_campaign_format_is_immutable(self):
        campaign = CampaignFactory()
        campaign.message.format = PlacementFormat.SPONSORSHIP
        campaign.message.save()
        campaign.format = PlacementFormat.SPONSORSHIP
        with self.assertRaises(ValidationError):
            campaign.clean()

    def test_campaign_fixed_slot_requires_schedule(self):
        message = MessageFactory(format=PlacementFormat.FIXED_SLOT)
        campaign = Campaign(
            budget=faker.random_int(),
            start_date=timezone.now().date(),
            finish_date=timezone.now().date(),
            message=message,
            format=PlacementFormat.FIXED_SLOT,
        )
        with self.assertRaises(ValidationError):
            campaign.clean()

    def test_campaign_channel_validates_channel_format(self):
        campaign = CampaignFactory(format=PlacementFormat.AUTOPILOT)
        incompatible_channel = ChannelFactory(
            supported_formats=[PlacementFormat.SPONSORSHIP],
            status=Channel.ChannelStatus.CONFIRMED,
        )
        channel_admin = ChannelAdminFactory()
        campaign_channel = CampaignChannelFactory(
            campaign=campaign,
            channel=incompatible_channel,
            channel_admin=channel_admin,
        )
        with self.assertRaises(ValidationError):
            campaign_channel.clean()


class ChannelTestCase(TransactionTestCase):
    def setUp(self):
        self.old_channel = ChannelFactory(status="pending")

    def test_add_cpm_success(self):
        channel = Channel.objects.create()
        self.assertEqual(channel.cpm, 0)

    def test_new_channel_status_pending_default_success(self):
        channel = Channel.objects.create()
        self.assertEqual(channel.status, Channel.ChannelStatus.PENDING)

    def test_channel_status_updatable_success(self):
        channel = Channel.objects.create(status=Channel.ChannelStatus.PENDING)
        channel.status = Channel.ChannelStatus.CONFIRMED
        channel.save()
        self.assertEqual(channel.status, Channel.ChannelStatus.CONFIRMED)

    def test_change_channel_status_CONFIRMED_success(self):
        is_not_valid = is_not_valid_channel_status(
            self.old_channel.status, Channel.ChannelStatus.CONFIRMED
        )
        self.assertFalse(is_not_valid)  # this means that status is valid

    def test_change_channel_status_REJECTED_success(self):
        is_not_valid = is_not_valid_channel_status(
            self.old_channel.status, Channel.ChannelStatus.REJECTED
        )
        self.assertFalse(is_not_valid)  # this means that status is valid

    def test_change_channel_status_PENDING_success(self):
        is_not_valid = is_not_valid_channel_status(
            self.old_channel.status, Channel.ChannelStatus.PENDING
        )
        self.assertTrue(is_not_valid)  # this means that status is not valid

    def test_create_channel_has_default_avatar(self):
        channel = Channel.objects.create(name='channel for testing')
        self.assertIsNotNone(channel.avatar_url, 'must be a value in the avatar_url by default')
        self.assertEqual(channel.avatar_url, '/static/custom/default.jpg')

    def test_channel_publication_slot_overlap_validation(self):
        channel = ChannelFactory()
        ChannelPublicationSlotFactory(
            channel=channel,
            weekday=0,
            start_time=timezone.datetime(2025, 1, 1, 10, 0).time(),
            end_time=timezone.datetime(2025, 1, 1, 11, 0).time(),
        )
        slot = ChannelPublicationSlotFactory.build(
            channel=channel,
            weekday=0,
            start_time=timezone.datetime(2025, 1, 1, 10, 30).time(),
            end_time=timezone.datetime(2025, 1, 1, 11, 30).time(),
        )
        with self.assertRaises(ValidationError):
            slot.full_clean()

    def test_channel_publication_slot_overlap_validation(self):
        channel = ChannelFactory()
        ChannelPublicationSlotFactory(channel=channel, weekday=0, start_time=timezone.datetime(2025, 1, 1, 10, 0).time(), end_time=timezone.datetime(2025, 1, 1, 11, 0).time())
        slot = ChannelPublicationSlotFactory.build(channel=channel, weekday=0, start_time=timezone.datetime(2025, 1, 1, 10, 30).time(), end_time=timezone.datetime(2025, 1, 1, 11, 30).time())
        with self.assertRaises(ValidationError):
            slot.full_clean()

    @mock.patch("core.serializers.TGStatClient")
    def test_channel_readding_resets_soft_delete_flag(self, tgstat_client):
        channel = ChannelFactory(is_deleted=True, is_bot_installed=False)
        serializer = ChannelSerializer(
            data={"tg_id": channel.tg_id, "name": channel.name},
            context={"request": None},
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()

        channel.refresh_from_db()
        self.assertFalse(channel.is_deleted)
        self.assertTrue(channel.is_bot_installed)
        tgstat_client.return_value.update_channel_info.assert_called_once_with(
            channel=channel
        )
        tgstat_client.return_value.update_channel_stat.assert_called_once_with(
            channel=channel
        )

    def test_campaign_totals_ignore_deleted_channels(self):
        campaign = CampaignFactory()
        active_channel = ChannelFactory(is_deleted=False)
        deleted_channel = ChannelFactory(is_deleted=True)

        CampaignChannelFactory(
            campaign=campaign,
            channel=active_channel,
            publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED,
            impressions_plan=1000,
            impressions_fact=500,
            clicks=7,
        )
        CampaignChannelFactory(
            campaign=campaign,
            channel=deleted_channel,
            publish_status=CampaignChannel.PublishStatusChoices.PUBLISHED,
            impressions_plan=2000,
            impressions_fact=1500,
            clicks=9,
        )

        self.assertEqual(campaign.total_channels_count, 1)
        self.assertEqual(campaign.total_impressions_fact, 500)
        self.assertEqual(campaign.total_clicks, 7)
        self.assertEqual(campaign.total_planed_views(), 1000)


class UtilsTestCase(TransactionTestCase):
    @skipIf(True, 'to delete not needed')
    def test_update_broken_avatar_success(self):
        channels = ChannelFactory.create_batch(size=10)
        i = 0

        for channel in channels[i:i+3]:
            # must be excluded from updating
            channel.avatar_url = '/static/custom/default.jpg'
            channel.save()
            i+=1

        for channel in channels[i:i+2]:
            # must be excluded from updating
            channel.avatar_url = 'https://google.com'
            channel.save()
            i+=1

        update_broken_channel_avatar()

        self.assertEqual(Channel.objects.count(), 10)
        self.assertFalse(Channel.objects.filter(avatar_url__isnull=True).exists())
        self.assertFalse(Channel.objects.filter(avatar_url="invalid-url").exists(), 'Should be updated to default avatar')
        self.assertEqual(Channel.objects.filter(avatar_url="https://google.com").count(), 2, 'Should be not updated')
        self.assertEqual(Channel.objects.filter(avatar_url="/static/custom/default.jpg").count(), 8)


class CampaignTestCase(TransactionTestCase):
    def test_brand_default_success(self):
        start_date = faker.date_between(start_date="+1day", end_date="+1days")
        finish_date = faker.date_between(start_date="+2day", end_date="+2days")
        campaign = Campaign.objects.create(
            message=MessageFactory.create(),
            start_date=start_date,
            finish_date=finish_date,
            budget=faker.random_int(1, 10000),
        )
        self.assertEqual(campaign.brand, "")

    def test_brand_value_success(self):
        start_date = faker.date_between(start_date="+1day", end_date="+1days")
        finish_date = faker.date_between(start_date="+2day", end_date="+2days")
        brand = faker.name()
        campaign = Campaign.objects.create(
            message=MessageFactory.create(),
            start_date=start_date,
            finish_date=finish_date,
            budget=faker.random_int(1, 10000),
            brand=brand,
        )
        self.assertEqual(campaign.brand, brand)

    def test_create_campaign_client_default_success(self):
        campaign = CampaignFactory.create()
        self.assertIsNotNone(campaign.client)
        self.assertIsNotNone(campaign.created_at)

    def test_campaign_channel_requires_slot_for_fixed(self):
        message = MessageFactory(format=PlacementFormat.FIXED_SLOT)
        campaign = CampaignFactory(message=message, format=PlacementFormat.FIXED_SLOT)
        campaign.slot_publication_at = timezone.now() + timezone.timedelta(days=1)
        campaign.save()
        channel = ChannelFactory()
        channel_admin = ChannelAdminFactory()
        channel_admin.channels.add(channel)

        slot = ChannelPublicationSlotFactory(
            channel=channel,
            weekday=campaign.slot_publication_at.weekday(),
            start_time=campaign.slot_publication_at.time().replace(second=0, microsecond=0),
            end_time=(campaign.slot_publication_at + timezone.timedelta(hours=1)).time().replace(second=0, microsecond=0),
        )

        campaign_channel = CampaignChannel(
            campaign=campaign,
            channel=channel,
            channel_admin=channel_admin,
        )

        with self.assertRaises(ValidationError):
            campaign_channel.clean()

        campaign_channel.publication_slot = slot
        campaign_channel.clean()
        campaign_channel.save()
        self.assertIsNotNone(campaign_channel.message_publish_date)

class ChannelAdminTestCase(TransactionTestCase):

    @tag('unittest_owner')
    def test_create_owner_user_success(self):
        owner = ChannelAdminFactory(role=ChannelAdmin.Role.OWNER) # user is created by django signals
        self.assertTrue(owner.is_owner)
        self.assertTrue(owner.user.is_owner)
        self.assertFalse(owner.is_manager)
        self.assertFalse(owner.user.is_manager)


    @tag('unittest_owner')
    def test_owner_channels_pending_success(self):
        owner = ChannelAdminFactory(role=ChannelAdmin.Role.OWNER, channels={'size': 3})
        channels = ChannelAdmin.objects.channels_by_status(owner.id, Channel.ChannelStatus.PENDING)
        self.assertEqual(channels.count(), 3)
