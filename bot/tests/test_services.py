from services import MainService
from parsers import CampaignChannelParserIn


def test_get_campaign_channels_success():
    service = MainService(parser=CampaignChannelParserIn)
    service.unpublished_campaign_channel_by_words(
        words="onede,two,three", channel_tg_id=-1002476819984
    )
    # mocked_response_func.assert_called_once()
    parsed_response = service.parse()
    print(f"{parsed_response=}")
