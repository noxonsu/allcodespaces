from rest_framework import status

from httpx import Client

from core.models import Channel
from core.serializers import TGStatSerializer, TGChannelInfo, TGChannelStat
from web_app.logger import logger


class MessageTGStatClient:
    def __init__(self):
        self.serializer_message = TGStatSerializer
        self.serializer_channel_info = TGChannelInfo
        self.serializer_channel_stat = TGChannelStat

    def update_message_views(self, *, response, campaign_channel):
        if response.status_code == status.HTTP_200_OK and response.json()['status'] == 'ok':
            logger.info(f'update_message_views {response.json()=}')
            serializer = self.serializer_message(data=response.json())
            serializer.is_valid(raise_exception=True)
            return serializer.save(campaign_channel=campaign_channel)

    def update_channel_info(self, *, response, channel: Channel):
        if response.status_code == status.HTTP_200_OK and response.json()['status'] == 'ok':
            response_json_data = response.json()['response']
            logger.info(f'update_channel_info {response_json_data=}')
            serializer = self.serializer_channel_info(instance=channel, data=response_json_data, partial=True)
            serializer.is_valid(raise_exception=True)
            return serializer.save()

    def update_channel_stat(self, *, response, channel: Channel):
        if response.status_code == status.HTTP_200_OK and response.json()['status'] == 'ok':
            response_json_data = response.json()['response']
            logger.info(f'update_channel_stat {response_json_data=}')
            serializer = self.serializer_channel_stat(instance=channel, data=response_json_data, partial=True)
            serializer.is_valid(raise_exception=True)
            return serializer.save()


class ExternalClient:
    def __init__(self):
        self.set_client(Client)
        self.service = None

    def set_client(self, Client):
        self.client = Client(**self.get_client_kwargs())

    def get_client_kwargs(self):
        return {}


class TGStatClient(ExternalClient):
    def __init__(self):
        super().__init__()
        self.token = '5f282a9bda3653ffd84d029cc537a6b0'
        self.service = MessageTGStatClient()

    def get_client_kwargs(self):
        return {'base_url': "https://api.tgstat.ru"}

    def update_message_views(self, campaign_channel):
        response = self.client.get(
            '/posts/get',
            params={
                "token": self.token,
                "postId": f't.me/c/{campaign_channel.channel.tg_id}/'+str(campaign_channel.channel_post_id)
            })
        print(f'update_message_views{response.json()=}')
        return self.service.update_message_views(response=response, campaign_channel=campaign_channel)


    def update_channel_info(self, channel: Channel):
        response = self.client.get(
            '/channels/get',
            params={
                "token": self.token,
                "channelId": channel.tg_id
            })
        logger.info(f'[{__class__}] update_channel_info: {response.url=} {response.status_code=}')
        return self.service.update_channel_info(response=response, channel=channel)


    def update_channel_stat(self, channel: Channel):
        response = self.client.get(
            '/channels/stat',
            params={
                "token": self.token,
                "channelId": channel.tg_id
            })
        print(f'update_channel_stat {response.json()=}')
        return self.service.update_channel_stat(response=response, channel=channel)

