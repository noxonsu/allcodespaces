import pytest

from parsers import CampaignChannelParserIn


channel_in_data = [[1,1]]


# @pytest.mark.parametrize('channel_in_data', GET_CHANNELS)
# class TestChannelParser:
#     def test_parse_channel_in_success(self, channel_in_data):
#         model_object = ChannelParser.model_validate(channel_in_data)
#         assert model_object is not None
#


# @pytest.mark.parametrize('campaign_channel_in_data', GET_CAMPAIGN_CHANNEL)
# class TestCampaignChannelParser:
#     def test_parse_campaign_channel_in_success(self, campaign_channel_in_data):
#         model_object = CampaignChannelParserIn.model_validate(campaign_channel_in_data)
#         assert model_object is not None


@pytest.mark.parametrize(
    'str_text, expected',
    [
        ("""Привет, друзья у нас (Новые-новости)!. мы будем публиковать «Сообщение» каждый 
день, пишите как вы думаете! 

Или 2сообшений лучше, пишите в  ЛС на @username""", "Привет,друзья,у,нас,Новые,новости,мы,будем,публиковать,Сообщение,каждый,день,пишите,как,вы,думаете,Или,2сообшений,лучше,пишите,в,ЛС,на,@username"),
        (
            """Hey bro, How are doing?
            I want to tell you that we all are going to 3-new-places <today> Yeah!! :)
            I am very happy to buy a new 1 cup of coffe, today.
            Call me at 8(000)00 00 00, or write me at @my_at_me_dotcom"""
        , "Hey,bro,How,are,doing"
          +",I,want,to,tell,you,that,we,all,are,going,to,3,new,places,today,Yeah"
          +",I,am,very,happy,to,buy,a,new,1,cup,of,coffe,today"
          +",Call,me,at,8,000,00,00,00,or,write,me,at,@my_at_me_dotcom"),
        ("",""),
        ("a", "a"),
        ("1", "1"),
    ]
)
def test_parse_long_message_success(str_text, expected):
    match = CampaignChannelParserIn.parse_tg_message(str_text)
    assert match == expected

