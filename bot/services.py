
from httpx import Client

url_base = 'http://web-app:8000'


class MainService:
    def __init__(self, parser=None):
        self.client = Client(base_url=url_base, headers={'Host': 'localhost', 'User-Agent': 'Mozilla/5.0'}, timeout=60*5)
        self.parser = parser
        self.urls = {
        "unpublished_messages": '/api/campaign-channel/?channel_tg_id={channel_tg_id}&is_message_published=false',
        "campaign_channels_words": '/api/campaign-channel/?channel_tg_id={channel_tg_id}&is_message_published=false&words={words}',
        "unpublished_campaign_channel_by_words": '/api/campaign-channel/unpublished-campaigns/',
        "campaign_channel_id": '/api/campaign-channel/{campaign_channel_id}/',
        "message_id": '/api/message/{id}/',
        "messages": '/api/message/',
        "messages_update": '/api/message/update/',
        "bot_kicked": '/api/channel/{tg_id}/',
        "channel_admin_join": '/api/channel-admin/join/',
        'campaign_channel_approve': "/api/campaign-channel/{campaign_channel_id}/", #toDO:Refactor
        'campaign_channel_reject': "/api/campaign-channel/{campaign_channel_id}/",  #toDO:Refactor
    }
        self._response_raw = []

    def campaign_channel_approve(self, campaign_channel_id):
        url = self.urls["campaign_channel_approve"].format(campaign_channel_id=campaign_channel_id)
        return self.client.patch(url, json=dict(publish_status='confirmed'))

    def campaign_channel_decline(self, campaign_channel_id):
        url = self.urls["campaign_channel_reject"].format(campaign_channel_id=campaign_channel_id)
        return self.client.patch(url, json=dict(publish_status='rejected'))

    def added_to_channel(self, data):
        return self.client.post(url='/api/channel/', json=data)

    def channel_admin_join(self, data):
        url = self.urls["channel_admin_join"]
        return self.client.put(url, json=data.dict(), headers={'Host': 'localhost'})

    def bot_kicked(self, chat_id: str):
        url = self.urls['bot_kicked'].format(tg_id=chat_id)
        return self.client.patch(url, json=dict(is_active=False, is_bot_installed=False))

    def get_channel_unpublished_messages(self, channel_tg_id):
        url = self.urls['unpublished_messages'].format(channel_tg_id=channel_tg_id)
        self._response_raw = self.client.get(url)
        return self._response_raw

    def update_public_message_info(self, _id, data):
        url = self.urls['message_id'].format(id=_id)
        return self.client.patch(url, json=data)

    def update_public_messages_info(self, campaign_channel_id, data):
        url = self.urls['campaign_channel_id'].format(campaign_channel_id=campaign_channel_id)
        return self.client.patch(url, json=data)

    def parse(self):
        data = []
        try:
            for row in self._response_raw.json():
                data.append(self.parser.model_validate(row))
        except Exception as e:
            print(f'{self._response_raw=}')
            print(f'{self._response_raw.content=}')
            print(f'PARSE ERROR: {e}')
        finally:
            return data
        # return [self.parser.model_validate(row) for row in self._response_raw.json()]

    def has_data(self):
        return self._response_raw is not None and len(self._response_raw.json()) > 0

    def get_campaign_channel_by_words(self, channel_tg_id, words: str):
        words = ','.join(words.lower().split(' '))
        url = self.urls['campaign_channels_words'].format(channel_tg_id=channel_tg_id, words=words)
        self._response_raw = self.client.get(url)
        return self._response_raw

    def unpublished_campaign_channel_by_words(self, channel_tg_id, words: str):
        data = dict(words=words, channel_tg_id=channel_tg_id, publish_status='confirmed')
        url = self.urls['unpublished_campaign_channel_by_words']
        self._response_raw = self.client.post(url, json=data)
        return self._response_raw
