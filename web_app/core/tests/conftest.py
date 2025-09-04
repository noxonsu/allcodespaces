import pytest

from core.tests.factories import (
    MessageFactory,
    ChannelFactory,
    CampaignFactory,
    ChannelAdminFactory,
    CampaignChannelFactory,
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
    return create_campaign_channel(is_stats=False)
