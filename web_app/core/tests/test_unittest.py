import django.utils.timezone as timezone
import pytest
from django.core.exceptions import ValidationError
from django.test import TransactionTestCase

from .conftest import create_campaign_channel
from .factories import ChannelAdminFactory, MessageFactory, CampaignFactory, ChannelFactory
from ..admin_utils import is_not_valid_channel_status
from ..models import Campaign, Channel
from faker import  Faker

faker = Faker()

pytestmark = [
    pytest.mark.django_db
]


class TestUnitTest(TransactionTestCase):
    def test_create_channel_admin_with_user(self):
        channel_admin = ChannelAdminFactory.create()
        assert channel_admin.user is not None

    def test_link_message_is_stats_true_success(self):
        url = '/api/campaign-channel/{id}/click/'
        campaign_channel = create_campaign_channel(is_external=False)
        self.assertEqual(campaign_channel.path_click_analysis, url.format(id=campaign_channel.id))

    def test_link_message_is_stats_false_success(self):
        campaign_channel = create_campaign_channel(is_external=True)
        self.assertEqual(campaign_channel.path_click_analysis, campaign_channel.campaign.message.button_link)


    def test_create_campaign_success(self):
        today = timezone.now().date()
        message = MessageFactory.create()

        campaign = Campaign(
            budget=faker.random_int(),
            start_date=today,
            finish_date=today,
            message=message
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
                start_date = timezone.datetime(2020, 1, 1).date(),
                finish_date = timezone.now().date(),
                message=message
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
                message=message)

            campaign.start_date = timezone.datetime(2020, 1, 1).date()
            campaign.clean()
            campaign.save()


class ChannelTestCase(TransactionTestCase):

    def setUp(self):
        self.old_channel = ChannelFactory(status='pending')

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
        is_not_valid = is_not_valid_channel_status(self.old_channel.status, Channel.ChannelStatus.CONFIRMED)
        self.assertFalse(is_not_valid) # this means that status is valid

    def test_change_channel_status_REJECTED_success(self):
        is_not_valid = is_not_valid_channel_status(self.old_channel.status, Channel.ChannelStatus.REJECTED)
        self.assertFalse(is_not_valid) # this means that status is valid

    def test_change_channel_status_PENDING_success(self):
        is_not_valid = is_not_valid_channel_status(self.old_channel.status, Channel.ChannelStatus.PENDING)
        self.assertTrue(is_not_valid)  # this means that status is not valid


class CampaignTestCase(TransactionTestCase):
    def test_brand_default_success(self):
        start_date = faker.date_between(start_date='+1day', end_date='+1days')
        finish_date = faker.date_between(start_date='+2day', end_date='+2days')
        campaign = Campaign.objects.create(
            message=MessageFactory.create(),
            start_date=start_date,
            finish_date=finish_date,
            budget=faker.random_int(1, 10000)
        )
        self.assertEqual(campaign.brand, '')

    def test_brand_value_success(self):
        start_date = faker.date_between(start_date='+1day', end_date='+1days')
        finish_date = faker.date_between(start_date='+2day', end_date='+2days')
        brand = faker.name()
        campaign = Campaign.objects.create(
            message=MessageFactory.create(),
            start_date=start_date,
            finish_date=finish_date,
            budget=faker.random_int(1, 10000),
            brand=brand
        )
        self.assertEqual(campaign.brand, brand)

    def test_create_campaign_client_default_success(self):
        campaign = CampaignFactory.create()
        self.assertEqual(campaign.client, '')
        self.assertIsNotNone(campaign.created_at)

