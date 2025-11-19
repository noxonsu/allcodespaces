from __future__ import annotations

"""
CHANGE: Refactored BalanceService to Event Sourcing approach
WHY: Simplify balance calculation, eliminate race conditions
QUOTE(ТЗ): "Event Sourcing - баланс = SUM(transactions). Нет race — только append"
REF: issue #22 (refactoring)

Event Sourcing подход:
- Баланс = просто SUM(amount) всех транзакций
- Заморожено = SUM(amount) где type='freeze'
- Нет статусов - только типы операций
- Нет race conditions - только INSERT
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from django.db.models import Sum, Q
from django.core.cache import cache

from core.models import Channel, ChannelTransaction, CampaignChannel, Campaign
from core.models import LegalEntity


@dataclass
class ChannelBalance:
    """
    Data class representing channel balance information

    balance: Total balance (sum of ALL transactions)
    frozen: Frozen amount (sum of 'freeze' transactions not yet unfrozen)
    available: Available for withdrawal (balance - frozen, but can't be negative)
    """
    balance: Decimal
    frozen: Decimal
    available: Decimal

    def __post_init__(self):
        """Ensure all values are Decimal"""
        self.balance = Decimal(str(self.balance or 0))
        self.frozen = Decimal(str(self.frozen or 0))
        self.available = Decimal(str(self.available or 0))


class BalanceService:
    """
    Service for calculating channel balance using Event Sourcing

    Event Sourcing принципы:
    - Balance = SUM(amount) всех транзакций
    - Frozen = ABS(SUM(amount WHERE type='freeze'))
    - Available = balance - frozen (но >= 0)

    Нет race conditions - транзакции append-only
    """

    CACHE_TTL = 300  # 5 minutes cache

    @classmethod
    def _get_cache_key(cls, channel_id: str) -> str:
        """Generate cache key for channel balance"""
        return f"channel_balance:{channel_id}"

    @classmethod
    def calculate_balance(
        cls,
        channel: Channel,
        use_cache: bool = True
    ) -> ChannelBalance:
        """
        Calculate balance for a channel (Event Sourcing approach)

        Args:
            channel: Channel instance
            use_cache: Whether to use cached values (default: True)

        Returns:
            ChannelBalance with balance, frozen, and available amounts
        """
        # Check if channel is soft-deleted
        if getattr(channel, 'is_deleted', False):
            return ChannelBalance(
                balance=Decimal('0'),
                frozen=Decimal('0'),
                available=Decimal('0')
            )

        # Try to get from cache
        if use_cache:
            cache_key = cls._get_cache_key(str(channel.id))
            cached = cache.get(cache_key)
            if cached:
                return ChannelBalance(**cached)

        # Event Sourcing: Balance = просто SUM всех транзакций
        balance_result = ChannelTransaction.objects.filter(
            channel=channel
        ).aggregate(total=Sum('amount'))

        balance = balance_result['total'] or Decimal('0')

        # Frozen = ABS(SUM транзакций type='freeze')
        # Freeze транзакции имеют отрицательную сумму, поэтому берём abs
        frozen_result = ChannelTransaction.objects.filter(
            channel=channel,
            transaction_type=ChannelTransaction.TransactionType.FREEZE
        ).aggregate(total=Sum('amount'))

        frozen = abs(frozen_result['total'] or Decimal('0'))

        # Available = balance - frozen (но не может быть отрицательным)
        available = max(balance - frozen, Decimal('0'))

        result = ChannelBalance(
            balance=balance,
            frozen=frozen,
            available=available
        )

        # Cache the result
        if use_cache:
            cache_key = cls._get_cache_key(str(channel.id))
            cache.set(cache_key, {
                'balance': str(balance),
                'frozen': str(frozen),
                'available': str(available)
            }, cls.CACHE_TTL)

        return result

    @classmethod
    def invalidate_cache(cls, channel: Channel) -> None:
        """
        Invalidate cached balance for a channel

        Should be called when transactions are created/updated/deleted
        """
        cache_key = cls._get_cache_key(str(channel.id))
        cache.delete(cache_key)

    @classmethod
    def get_balance_for_channels(cls, channels: list[Channel]) -> dict[str, ChannelBalance]:
        """
        Get balances for multiple channels (Event Sourcing bulk calculation)

        Args:
            channels: List of Channel instances

        Returns:
            Dictionary mapping channel_id to ChannelBalance
        """
        # Exclude soft-deleted channels
        active_channels = [c for c in channels if not getattr(c, 'is_deleted', False)]
        channel_ids = [str(c.id) for c in active_channels]

        if not channel_ids:
            return {}

        # Event Sourcing: Balance = SUM всех транзакций (без фильтра по статусу)
        balance_data = ChannelTransaction.objects.filter(
            channel_id__in=channel_ids
        ).values('channel_id').annotate(
            total=Sum('amount')
        )

        balances = {str(item['channel_id']): item['total'] or Decimal('0') for item in balance_data}

        # Frozen = ABS(SUM транзакций type='freeze')
        frozen_data = ChannelTransaction.objects.filter(
            channel_id__in=channel_ids,
            transaction_type=ChannelTransaction.TransactionType.FREEZE
        ).values('channel_id').annotate(
            total=Sum('amount')
        )

        frozen_amounts = {str(item['channel_id']): abs(item['total'] or Decimal('0')) for item in frozen_data}

        # Build result dictionary
        result = {}
        for channel in active_channels:
            channel_id = str(channel.id)
            balance = balances.get(channel_id, Decimal('0'))
            frozen = frozen_amounts.get(channel_id, Decimal('0'))
            available = max(balance - frozen, Decimal('0'))

            result[channel_id] = ChannelBalance(
                balance=balance,
                frozen=frozen,
                available=available
            )

        return result

    @classmethod
    def get_legal_entity_balance(cls, legal_entity: LegalEntity) -> ChannelBalance:
        """Aggregate balance for all non-deleted channels of a legal entity"""
        channels = list(legal_entity.channels.filter(is_deleted=False))
        balances = cls.get_balance_for_channels(channels)

        total_balance = Decimal("0")
        total_frozen = Decimal("0")
        for channel in channels:
            cb = balances.get(str(channel.id), ChannelBalance(Decimal("0"), Decimal("0"), Decimal("0")))
            total_balance += cb.balance
            total_frozen += cb.frozen

        total_available = max(total_balance - total_frozen, Decimal("0"))
        return ChannelBalance(balance=total_balance, frozen=total_frozen, available=total_available)


class CreativeSelectionService:
    """
    CHANGE: Added service for selecting suitable creative for publication request
    WHY: Required by ТЗ 4.1.2 - select creative and initiate publication
    QUOTE(ТЗ): "выбрать подходящий креатив и инициировать публикацию через существующий движок"
    REF: issue #46

    Service для выбора подходящего креатива на основе:
    - Формата размещения
    - Поддержки формата каналом
    - Активной кампании с креативом нужного формата
    - Бюджета кампании
    """

    @classmethod
    def select_creative(cls, channel: Channel, format: str, parameters: dict) -> Optional[Campaign]:
        """
        Выбрать подходящую кампанию с креативом для публикации

        Args:
            channel: Канал для публикации
            format: Формат размещения (sponsorship/fixed_slot/autopilot)
            parameters: Дополнительные параметры

        Returns:
            Campaign instance или None если не найдено
        """
        from core.models import Campaign, PlacementFormat
        from django.utils import timezone

        # Проверяем что канал поддерживает этот формат
        if format not in (channel.supported_formats or []):
            return None

        # Ищем активные кампании с нужным форматом
        now = timezone.now().date()

        campaigns = Campaign.objects.filter(
            status=Campaign.Statuses.ACTIVE,
            is_archived=False,
            format=format,
            start_date__lte=now,
            finish_date__gte=now,
        ).select_related('message').order_by('-created_at')

        # Проверяем бюджет и отсутствие публикаций в этом канале
        for campaign in campaigns:
            # Проверяем что кампания ещё не публиковалась в этом канале
            already_published = campaign.campaigns_channel.filter(
                channel=channel,
                publish_status__in=[
                    CampaignChannel.PublishStatusChoices.PUBLISHED,
                    CampaignChannel.PublishStatusChoices.CONFIRMED,
                ]
            ).exists()

            if already_published:
                continue

            # Проверяем бюджет (упрощённо - просто что бюджет > 0)
            if campaign.budget <= 0:
                continue

            # Нашли подходящую кампанию
            return campaign

        return None

    @classmethod
    def create_publication(
        cls,
        channel: Channel,
        campaign: Campaign,
        parameters: dict
    ) -> CampaignChannel:
        """
        Создать связь кампании с каналом для публикации

        Args:
            channel: Канал для публикации
            campaign: Кампания с креативом
            parameters: Дополнительные параметры

        Returns:
            CampaignChannel instance
        """
        from core.models import CampaignChannel
        from django.utils import timezone

        # Создаём запись для публикации
        campaign_channel = CampaignChannel.objects.create(
            channel=channel,
            campaign=campaign,
            cpm=Decimal('0'),  # TODO: рассчитать CPM
            plan_cpm=Decimal('0'),
            impressions_plan=0,
            publish_status=CampaignChannel.PublishStatusChoices.CONFIRMED,
            message_publish_date=timezone.now(),  # Публикуем сразу
        )

        return campaign_channel
