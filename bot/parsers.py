import re
from datetime import datetime
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Json, Field, computed_field
from decimal import Decimal

from settings import bot_settings

BASE_DIR = Path(__file__).resolve().parent.parent


class MessageLink(BaseModel):
    id: str | UUID
    title: str = ''
    url: str = ''


class MessageParser(BaseModel):
    model_config = ConfigDict()

    as_text: str
    id: str | UUID
    name: str| None = ''
    title: str | None = ''
    body: str = 'Empty body'
    image: str | None = ''
    video: str | None = ''
    created_at: str | None = ''
    updated_at: str | None = ''
    button: MessageLink| None = None
    is_external: bool = Field(default=False)

    @computed_field
    @property
    def has_video(self) -> bool:
        return self.video != '' and self.video is not None

    @computed_field
    @property
    def has_button(self)-> bool:
        return self.button != '' and self.button is not None

    @computed_field
    @property
    def has_image(self)-> bool:
        return self.image != '' and self.image is not None

    @computed_field
    @property
    def image_local_path(self) -> str :
        return BASE_DIR / 'media' / self.image if self.image else ''

    @computed_field
    @property
    def video_local_path(self) -> str :
        return BASE_DIR / 'media' / self.video if self.video else ''

class ChannelParser(BaseModel):
    id: str | UUID
    name: str = ''
    tg_id : str | None = ''
    is_bot_installed : bool = False
    is_active : bool = False
    meta : Json | None = None
    cpm : int = 0


class ChannelAdminParser(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str | UUID
    username: str
    first_name: str
    last_name: str
    phone_number: str
    tg_id: int
    is_bot_installed: bool



class CampaignParser(BaseModel):
    id: str | UUID
    name: str = ''
    budget: Decimal = Decimal(0)
    start_date: datetime | None = None
    finish_date: datetime | None = None
    message: MessageParser | None = None
    black_list: list[str] | list
    white_list: list[str] | list
    client: str = ''
    brand: str = ''


class CampaignChannelParserIn(BaseModel):
    id: str | UUID
    channel: ChannelParser
    campaign: CampaignParser
    channel_admin: ChannelAdminParser
    created_at: datetime| None = Field(default_factory=datetime.now)
    impressions_plan: Decimal | None = None
    impressions_fact: Decimal | None = None
    cpm: Decimal | None = None
    path_click_analysis: str | None  = ''
    channel_post_id: str | None  = ''
    message_publish_date: datetime | None = None
    is_message_published: bool | None = False
    is_approved: bool = False

    @computed_field
    @property
    def analysis_link(self) -> str:
        if not self.has_message_button:
            return 'https//app.telewin.online'
        elif bot_settings.DEV or self.message_is_external:
            return self.message.button.url

        return bot_settings.SCHEMA_DOMAIN + self.path_click_analysis
    @computed_field
    @property
    def message_is_external(self) -> bool:
        return self.message and self.message.is_external

    @computed_field
    @property
    def has_message(self)-> bool:
        return self.campaign and self.campaign.message

    @computed_field
    @property
    def has_message_button(self)-> bool:
        return self.has_message and self.campaign.message.has_button

    @computed_field
    @property
    def has_message_video(self)-> bool:
        return self.has_message and self.campaign.message.has_video

    @computed_field
    @property
    def has_message_image(self)-> bool:
        return self.has_message and self.campaign.message.has_image

    @computed_field
    @property
    def message_as_text(self)-> str:
        return self.campaign.message.as_text

    @computed_field
    @property
    def has_white_list(self)-> bool:
        return self.campaign.white_list

    @computed_field
    @property
    def has_black_list(self)-> bool:
        return self.campaign.black_list

    @computed_field
    @property
    def message(self)-> MessageParser | None:
        return self.campaign.message

    @computed_field
    @property
    def can_be_published(self) -> bool:
        if not self.is_approved:
            return False
        if not self.campaign:
            return False
        if self.campaign and not self.campaign.message:
            return False
        if not self.has_white_list and not self.has_black_list:
            return True
        if self.has_black_list and not self.has_white_list:
            return False
        if self.has_black_list:
            black_list = self.campaign.black_list
            for word in black_list:
                if word in self.campaign.message.as_text:
                    return False
        if self.has_white_list:
            white_list = self.campaign.white_list
            for word in white_list:
                if word not in self.campaign.message.as_text:
                    return False
        return True

    @staticmethod
    def parse_tg_message(message_text: str) -> str:
        """the message could have multiline!"""
        if not message_text:
            return ""
        # p = r'(\w+-|[\w\@\_])'
        p_to_words= r'@?\w+|\b\.\b\w+'
        # p_to_words = r'(\w+-\w+|@?\w+)'
        match = re.findall(p_to_words, message_text)
        return ','.join(match)


class UpdateFromUserParser(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    first_name: str = ""
    last_name: str | None = ""
    tg_id: str | int = Field(validation_alias='id')
    username: str = ""
    role: str = 'owner'
    is_bot_installed: bool = True