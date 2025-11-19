from celery import app
from decimal import Decimal

from core.utils import BotNotifier
from web_app.logger import log_func, logger
from core.external_clients import TGStatClient
from core.models import CampaignChannel, LegalEntity, Payout
from core.services import BalanceService


MIN_PAYOUT_AMOUNT = Decimal("100.00")


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
        channel_post_id__isnull=True,  # Еще не опубликованы
        channel__is_deleted=False,
        campaign__is_archived=False,
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


@app.shared_task(bind=True)
@log_func
def create_payouts_for_legal_entities(*args, **kwargs):
    """
    Автоматическое создание выплат по юрлицам.

    - Берём все юрлица с доступным балансом >= MIN_PAYOUT_AMOUNT.
    - Создаём payout в статусе draft (или pending, если передано через kwargs).
    - Идемпотентность: не создаём payout, если уже есть draft/pending на это юрлицо с той же суммой.
    - Логируем результаты.
    """

    min_amount = Decimal(str(kwargs.get("min_amount", MIN_PAYOUT_AMOUNT)))
    target_status = kwargs.get("status", Payout.Status.DRAFT)

    created = 0
    skipped = 0

    for legal_entity in LegalEntity.objects.all():
        totals = BalanceService.get_legal_entity_balance(legal_entity)
        if totals.available < min_amount:
            skipped += 1
            continue

        existing = Payout.objects.filter(
            legal_entity=legal_entity,
            status__in=[Payout.Status.DRAFT, Payout.Status.PENDING],
            amount=totals.available,
        ).exists()

        if existing:
            skipped += 1
            continue

        payout = Payout.objects.create(
            legal_entity=legal_entity,
            amount=totals.available,
            currency="RUB",
            status=target_status,
            description="Авто-начисление по доступному балансу",
        )
        created += 1
        logger.info(f"[PayoutTask] created payout {payout.id} for {legal_entity} amount={payout.amount}")

    logger.info(f"[PayoutTask] done created={created} skipped={skipped} min_amount={min_amount}")
    return {"created": created, "skipped": skipped, "min_amount": str(min_amount)}
