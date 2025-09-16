import pytest
from django.contrib.auth.models import Group

from core.models import ChannelAdmin
from core.tests.factories import (
    MessageFactory,
    ChannelFactory,
    CampaignFactory,
    ChannelAdminFactory,
    CampaignChannelFactory, UserFactory,
)


def create_campaign_channel(is_external):
    message = MessageFactory(is_external=is_external)
    campaign = CampaignFactory(message=message, status="active")
    channel = ChannelFactory()
    channeladmin = ChannelAdminFactory()
    return CampaignChannelFactory(
        campaign=campaign, channel=channel, channel_admin=channeladmin
    )


@pytest.fixture()
def campagin_channel_is_stats_true():
    return create_campaign_channel(is_external=True)


@pytest.fixture
def campagin_channel_is_stats_false():
    return create_campaign_channel(is_external=False)


@pytest.fixture()
def owner_group():
    return Group.objects.create(name=ChannelAdmin.Role.OWNER)


@pytest.fixture()
def manger_group():
    return Group.objects.create(name=ChannelAdmin.Role.MANAGER)


@pytest.fixture
def create_owner(owner_group):
    user = UserFactory()
    user.groups.add(owner_group)
    return ChannelAdminFactory(user=user)


@pytest.fixture
def create_manager(manger_group):
    user = UserFactory()
    user.groups.add(manger_group)
    return ChannelAdminFactory(user=user)


def create_owner_fn():
    return create_owner
