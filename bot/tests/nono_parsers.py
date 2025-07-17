import pytest

from bot.parsers import ChannelParser, CampaignChannelParserIn
from bot.tests.py_data import GET_CHANNELS, GET_CAMPAIGN_CHANNEL

channel_in_data = [[1,1]]


@pytest.mark.parametrize('channel_in_data', GET_CHANNELS)
class TestChannelParser:
    def test_parse_channel_in_success(self, channel_in_data):
        model_object = ChannelParser.model_validate(channel_in_data)
        assert model_object is not None



@pytest.mark.parametrize('campaign_channel_in_data', GET_CAMPAIGN_CHANNEL)
class TestCampaignChannelParser:
    def test_parse_campaign_channel_in_success(self, campaign_channel_in_data):
        model_object = CampaignChannelParserIn.model_validate(campaign_channel_in_data)
        assert model_object is not None

