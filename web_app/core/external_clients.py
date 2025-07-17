from rest_framework import status

from httpx import Client

from core.models import Channel
from core.serializers import TGStatSerializer, TGChannelInfo, TGChannelStat


class MessageTGStatClient:
    def __init__(self):
        self.serializer_message = TGStatSerializer
        self.serializer_channel_info = TGChannelInfo
        self.serializer_channel_stat = TGChannelStat

    def update_message_views(self, *, response, campaign_channel):
        if response.status_code == status.HTTP_200_OK and response.json()['status'] == 'ok':
            serializer = self.serializer_message(data=response.json())
            serializer.is_valid(raise_exception=True)
            return serializer.save(campaign_channel=campaign_channel)

    def update_channel_info(self, *, response, channel: Channel):
        if response.status_code == status.HTTP_200_OK and response.json()['status'] == 'ok':
            response_json_data = response.json()['response']
            serializer = self.serializer_channel_info(instance=channel, data=response_json_data, partial=True)
            serializer.is_valid(raise_exception=True)
            return serializer.save()

    def update_channel_stat(self, *, response, channel: Channel):
        if response.status_code == status.HTTP_200_OK and response.json()['status'] == 'ok':
            response_json_data = response.json()['response']
            serializer = self.serializer_channel_stat(instance=channel, data=response_json_data, partial=True)
            serializer.is_valid(raise_exception=True)
            return serializer.save()


class ExternalClient:
    def __init__(self):
        self.client = Client()
        self.service = None


class TGStatClient(ExternalClient):
    def __init__(self):
        super().__init__()
        self.token = '5f282a9bda3653ffd84d029cc537a6b0'
        self.service = MessageTGStatClient()

    def update_message_views(self, campaign_channel):
        response = self.client.get(
            'https://api.tgstat.ru/posts/get',
            params={
                "token": self.token,
                "postId": f't.me/c/{campaign_channel.channel.tg_id}/'+str(campaign_channel.channel_post_id)
            })
        print(f'update_message_views{response.json()=}')
        return self.service.update_message_views(response=response, campaign_channel=campaign_channel)


    def update_channel_info(self, channel: Channel):
        response = self.client.get(
            'https://api.tgstat.ru/channels/get',
            params={
                "token": self.token,
                "channelId": channel.tg_id
            })
        return self.service.update_channel_info(response=response, channel=channel)


    def update_channel_stat(self, channel: Channel):
        response = self.client.get(
            'https://api.tgstat.ru/channels/stat',
            params={
                "token": self.token,
                "channelId": channel.tg_id
            })
        print(f'update_channel_stat {response.json()=}')
        return self.service.update_channel_stat(response=response, channel=channel)

