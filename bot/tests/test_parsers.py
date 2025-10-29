from uuid import uuid4

import pytest
import datetime

from parsers import (
    CampaignChannelParserIn,
    ChannelParser,
    MessageLink,
    MessageParser,
    CampaignParser,
    ChannelAdminParser,
)

channel_in_data = [[1, 1]]


# @pytest.mark.parametrize('channel_in_data', GET_CHANNELS)
# class TestChannelParser:
#     def test_parse_channel_in_success(self, channel_in_data):
#         model_object = ChannelParser.model_validate(channel_in_data)
#         assert model_object is not None
#


@pytest.mark.parametrize(
    "str_text, expected",
    [
        (
            """Привет, друзья у нас (Новые-новости)!. мы будем публиковать «Сообщение» каждый 
день, пишите как вы думаете! 

Или 2сообшений лучше, пишите в  ЛС на @username""",
            "Привет,друзья,у,нас,Новые,новости,мы,будем,публиковать,Сообщение,каждый,день,пишите,как,вы,думаете,Или,2сообшений,лучше,пишите,в,ЛС,на,@username",
        ),
        (
            """Hey bro, How are doing?
            I want to tell you that we all are going to 3-new-places <today> Yeah!! :)
            I am very happy to buy a new 1 cup of coffe, today.
            Call me at 8(000)00 00 00, or write me at @my_at_me_dotcom""",
            "Hey,bro,How,are,doing"
            + ",I,want,to,tell,you,that,we,all,are,going,to,3,new,places,today,Yeah"
            + ",I,am,very,happy,to,buy,a,new,1,cup,of,coffe,today"
            + ",Call,me,at,8,000,00,00,00,or,write,me,at,@my_at_me_dotcom",
        ),
        ("", ""),
        ("a", "a"),
        ("1", "1"),
    ],
)
def test_parse_long_message_success(str_text, expected):
    match = CampaignChannelParserIn.parse_tg_message(str_text)
    assert match == expected


@pytest.mark.parametrize(
    "data",
    (
        dict(
            id=uuid4(),
            name="fake channel",
            tg_id="12163561",
            is_bot_installed=True,
            status="confirmed",
            meta=None,
            cpm=123123,
            supported_formats=["autopilot", "sponsorship"],
        ),
        dict(
            id=uuid4(),
            name="fake channel2",
            tg_id="12163561",
            is_bot_installed=False,
            status="pending",
            cpm=123123,
            supported_formats=["autopilot"],
        ),
    ),
)
def test_validate_channel_incomming_success(data):
    parser = ChannelParser.model_validate(data)
    assert parser.is_bot_installed is data["is_bot_installed"]
    assert parser.cpm == data["cpm"]
    assert parser.status == data["status"]
    assert parser.tg_id == data["tg_id"]
    assert parser.name == data["name"]
    assert parser.id == data["id"]
    assert parser.supported_formats == data.get("supported_formats", [])


@pytest.mark.parametrize(
    "data",
    (
        dict(
            id=uuid4(),
            title="string on the btn",
            url="https://www.google.com",
        ),
        dict(
            id=uuid4(),
            title="",
            url="http://www.google.com",
        ),
        dict(
            id=uuid4(),
        ),
    ),
)
def test_validate_messagelink_incomming_success(data):
    parser = MessageLink.model_validate(data)
    assert parser.id == data["id"]
    assert parser.title == data.get("title", "")
    assert parser.url == data.get("url", "")


@pytest.mark.parametrize(
    "data",
    (
        dict(
            id=uuid4(),
            as_text="The message is fake",
            name="fake message",
            title="fake title",
            body="fake body",
            image="path/to/image",
            video="path/to/video",
            created_at="2025-1-1",
            updated_at="2025-1-2",
            button=dict(id=uuid4(), title="fake button", url="https://www.google.com"),
            is_external=True,
            format="autopilot",
        ),
        dict(
            id=uuid4(),
            as_text="The message is fake",
            button=dict(id=uuid4()),
            is_external=True,
            format="sponsorship",
        ),
    ),
)
def test_validate_message_incoming_success(data):
    parser = MessageParser.model_validate(data)
    assert parser.id == data["id"]
    assert parser.as_text == data["as_text"]
    assert parser.name == data.get("name", "")
    assert parser.title == data.get("title", "")
    assert parser.body == data.get("body", "Empty body")
    assert parser.image == data.get("image", "")
    assert parser.video == data.get("video", "")
    assert parser.is_external is data["is_external"]
    assert parser.button.id == data["button"]["id"]
    assert parser.format == data.get("format")


@pytest.mark.parametrize(
    "data",
    (
        dict(
            id=uuid4(),
            name="fake campaign",
            budget="45.45",
            start_date="2024-1-1",
            finish_date="2024-1-3",
            message=dict(
                id=uuid4(),
                as_text="The message is fake",
                name="fake message",
                title="fake title",
                body="fake body",
                image="path/to/image",
                video="path/to/video",
                created_at="2025-1-1",
                updated_at="2025-1-2",
                button=dict(
                    id=uuid4(), title="fake button", url="https://www.google.com"
                ),
                is_external=True,
                format="autopilot",
            ),
            black_list=["block"],
            white_list=["allow"],
            client="client",
            brand="client",
            format="autopilot",
            format_display="Автопилот",
            slot_publication_at="2024-01-02 09:00:00",
        ),
        dict(
            id=uuid4(),
            name="fake campaign",
            budget="45.45",
            start_date=datetime.datetime.now(),
            finish_date=datetime.datetime.now(),
            message=dict(
                id=uuid4(),
                as_text="The message is fake",
                name="fake message",
                title="fake title",
                body="fake body",
                image="path/to/image",
                video="path/to/video",
                created_at=datetime.datetime.now(),
                updated_at=datetime.datetime.now(),
                button=dict(
                    id=uuid4(), title="fake button", url="https://www.google.com"
                ),
                is_external=True,
                format="fixed_slot",
            ),
            black_list=[],
            white_list=["allow"],
            client="client2",
            brand="brand 2",
            format="fixed_slot",
            format_display="Фикс-слот",
            slot_publication_at=datetime.datetime.now(),
        ),
        dict(
            id=uuid4(),
            name="fake campaign",
            budget="45.45",
            start_date=datetime.datetime.now(),
            finish_date=datetime.datetime.now(),
            message=dict(
                id=uuid4(),
                as_text="The message is fake",
                name="fake message",
                title="fake title",
                body="fake body",
                image="",
                video="",
                created_at=datetime.datetime.now(),
                updated_at=datetime.datetime.now(),
                button=dict(
                    id=uuid4(), title="fake button", url="https://www.google.com"
                ),
                is_external=True,
                format="sponsorship",
            ),
            black_list=[],
            white_list=[],
            client="client2",
            brand="brand 2",
            format="sponsorship",
            format_display="Спонсорство",
            slot_publication_at=None,
        ),
    ),
)
def test_validate_campaign_incomming_success(data):
    parser = CampaignParser.model_validate(data)
    assert parser.id == data["id"]
    assert parser.name == data.get("name", "")
    assert parser.budget == data["budget"]
    assert parser.start_date == data.get("start_date")
    assert parser.finish_date == data.get("finish_date")
    assert parser.message.as_text == data["message"]["as_text"]
    assert parser.black_list == data.get("black_list", [])
    assert parser.white_list == data.get("white_list", [])
    assert parser.client == data.get("client", "")
    assert parser.brand == data.get("brand", "")
    assert parser.format == data.get("format")
    assert parser.format_display == data.get("format_display")
    assert parser.slot_publication_at == data.get("slot_publication_at")


@pytest.mark.parametrize(
    "data",
    (
        dict(
            id=uuid4(),
            username="username fake",
            first_name="fake first",
            last_name="fake last",
            phone_number="1234567890",
            tg_id="1234567890",
            is_bot_installed=True,
        ),
    ),
)
def test_validate_channeladmin_incoming_success(data):
    parser = ChannelAdminParser.model_validate(data)
    assert parser.id == data["id"]
    assert parser.username == data["username"]
    assert parser.first_name == data["first_name"]
    assert parser.last_name == data["last_name"]
    assert parser.phone_number == data["phone_number"]
    assert parser.tg_id == data["tg_id"]
    assert parser.is_bot_installed == data["is_bot_installed"]


@pytest.mark.parametrize(
    "data",
    (
        dict(
            id=uuid4(),
            campaign=dict(
                id=uuid4(),
                name="fake campaign",
                budget="45.45",
                start_date="2024-1-1",
                finish_date="2024-1-3",
                message=dict(
                    id=uuid4(),
                    as_text="The message is fake",
                    name="fake message",
                    title="fake title",
                    body="fake body",
                    image="path/to/image",
                    video="path/to/video",
                    created_at="2025-1-1",
                    updated_at="2025-1-2",
                button=dict(
                    id=uuid4(), title="fake button", url="https://www.google.com"
                ),
                is_external=True,
                format="autopilot",
            ),
            black_list=["block"],
            white_list=["allow"],
            client="client",
            brand="client",
            format="autopilot",
            format_display="Автопилот",
            slot_publication_at="2024-01-02 10:00:00",
        ),
        channel=dict(
            id=uuid4(),
            name="fake channel2",
            tg_id="12163561",
            is_bot_installed=False,
            status="pending",
            cpm=123123,
            supported_formats=["autopilot"],
        ),
        channel_admin=dict(
            id=uuid4(),
            username="username fake",
            first_name="fake first",
                last_name="fake last",
                phone_number="1234567890",
                tg_id="1234567890",
                is_bot_installed=True,
            ),
            created_at="2025-1-1 11:12:00",
            impressions_plan="12.1",
            impressions_fact="11.1",
            cpm="11.1",
            path_click_analysis="/path/to/endpoint",
        ),
    ),
)
def test_validate_campaign_channel_success(data):
    parser = CampaignChannelParserIn.model_validate(data)
    assert parser.id == data["id"]
    assert parser.channel.id == data["channel"]["id"]
    assert parser.campaign.id == data["campaign"]["id"]
    assert parser.created_at == data["created_at"]
    assert parser.impressions_plan == data["impressions_plan"]
    assert parser.impressions_fact == data["impressions_fact"]
    assert parser.cpm == data["cpm"]
    assert parser.path_click_analysis == data["path_click_analysis"]
    assert parser.scheduled_publication_at == data["campaign"]["slot_publication_at"]
