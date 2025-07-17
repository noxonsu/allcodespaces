from celery import app

from web_app.logger import log_func
from core.external_clients import TGStatClient
from core.models import CampaignChannel


@app.shared_task(bind=True)
@log_func
def campaign_alter_activity(*args, **kwargs):
    return CampaignChannel.cls_alter_campaign_activity()


@app.shared_task(bind=True)
@log_func
def campaign_messages_90_mins_before(*args, **kwargs):
    campaign_channels = CampaignChannel.objects.recent_published_messages_since(minutes=90)
    print(f'{campaign_channels=}')
    tg_client = TGStatClient()
    for campaign_channel in campaign_channels:
        tg_client.update_message_views(campaign_channel=campaign_channel)
