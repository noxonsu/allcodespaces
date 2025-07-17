from unittest.mock import patch

import pytest

from bot.tests.py_data import GET_CAMPAIGN_CHANNEL
from bot.services import MainService
from bot.parsers import CampaignChannelParserIn


class TestMainService:
    @patch(
        'bot.services.Client.get',
        return_value=GET_CAMPAIGN_CHANNEL)
    def test_get_campaign_channels_success(self, mocked_response_func):
        parser = CampaignChannelParserIn
        service = MainService(parser)
        service.get_channel_unpublished_messages('fakeeee')
        mocked_response_func.assert_called_once()
        parsed_response = service.parse()
        assert isinstance(parsed_response, list)
        assert isinstance(parsed_response[0], CampaignChannelParserIn)
