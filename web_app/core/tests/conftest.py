import pytest

from core.tests.factories import MessageFactory, ChannelFactory, CampaignFactory, ChannelAdminFactory, \
    CampaignChannelFactory


def create_campaign_channel(is_stats):
    message = MessageFactory(is_stats=is_stats)
    campaign = CampaignFactory(message=message, status='active')
    channel = ChannelFactory()
    channeladmin = ChannelAdminFactory()
    return CampaignChannelFactory(campaign=campaign, channel=channel, channel_admin=channeladmin)


@pytest.fixture()
def campagin_channel_is_stats_true():
    return create_campaign_channel(is_stats=True)


@pytest.fixture
def campagin_channel_is_stats_false():
    return create_campaign_channel(is_stats=False)
