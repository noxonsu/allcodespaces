from celery import app

from core.utils import BotNotifier
from web_app.logger import log_func, logger
from core.external_clients import TGStatClient
from core.models import CampaignChannel


@app.shared_task(bind=True)
@log_func
def campaign_alter_activity(*args, **kwargs):
    return CampaignChannel.cls_alter_campaign_activity()


@app.shared_task(bind=True)
@log_func
def campaign_messages_90_mins_before(*args, **kwargs):
    campaign_channels = CampaignChannel.objects.recent_published_messages_since(
        minutes=90
    )
    print(f"{campaign_channels=}")
    tg_client = TGStatClient()
    for campaign_channel in campaign_channels:
        tg_client.update_message_views(campaign_channel=campaign_channel)


@app.shared_task(bind=True)
@log_func
def update_campaign_channel_views(*args, **kwargs):
    id = kwargs.get("campaign_channel_id")
    if not id:
        return
    client = TGStatClient()
    campaign_channel = CampaignChannel.objects.get(pk=id)
    client.update_message_views(campaign_channel)


@app.shared_task(
    bind=True,
)
def task_notify_channeladmin_was_added_channel(*args, **kwargs) -> None:
    """Send msg in telegram to a channeladmin that he was added in a channel"""
    logger.info("[Task]task_notify_channeladmin_was_added_channel has started.")

    bot_service = BotNotifier()
    bot_service.channeladmin_added(
        channel_name=kwargs['channel_name'],
        channeladmin_tgid=kwargs['channeladmin_tgid'])


@app.shared_task(bind=True)
@log_func
def check_and_publish_scheduled_messages(*args, **kwargs):
    """Check for scheduled messages that should be published now"""
    from django.utils import timezone
    import requests
    from rest_framework.renderers import JSONRenderer
    from core.serializers import CampaignChannelSerializer
    from web_app.app_settings import app_settings

    now = timezone.now()
    logger.info(f"[Task] Checking scheduled messages at {now}")

    # Получаем подтвержденные сообщения с наступившим временем публикации
    campaign_channels = CampaignChannel.objects.filter(
        publish_status=CampaignChannel.PublishStatusChoices.CONFIRMED,
        message_publish_date__isnull=False,
        message_publish_date__lte=now,
        channel_post_id__isnull=True  # Еще не опубликованы
    ).select_related('campaign', 'channel', 'channel_admin')

    count = campaign_channels.count()
    logger.info(f"[Task] Found {count} messages to publish")

    published = 0
    for cc in campaign_channels:
        try:
            data = JSONRenderer().render(CampaignChannelSerializer(cc).data)
            response = requests.post(
                f"{app_settings.DOMAIN_URI}/telegram/public-campaign-channel",
                data=data,
                headers={"content-type": "application/json"},
                timeout=30
            )
            if response.status_code == 200:
                published += 1
                logger.info(f"[Task] Published message for CampaignChannel #{cc.id}")
            else:
                logger.error(f"[Task] Failed to publish CampaignChannel #{cc.id}: {response.status_code}")
        except Exception as e:
            logger.error(f"[Task] Error publishing CampaignChannel #{cc.id}: {e}")

    logger.info(f"[Task] Published {published}/{count} messages")
    return {"checked": count, "published": published}
