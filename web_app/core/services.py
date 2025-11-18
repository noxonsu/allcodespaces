"""
CHANGE: Created BalanceService for calculating channel balances
WHY: Required by ТЗ 1.1.2 - service to aggregate operations and calculate balance/frozen/available amounts
QUOTE(ТЗ): "агрегирует операции и выдаёт три ключевых значения (баланс, заморожено, доступно)"
REF: issue #22
"""
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional
from django.db.models import Sum, Q
from django.core.cache import cache

from core.models import Channel, ChannelTransaction


@dataclass
class ChannelBalance:
    """
    Data class representing channel balance information

    balance: Total balance (sum of all completed transactions)
    frozen: Amount frozen (sum of pending and frozen transactions)
    available: Available for withdrawal (balance - frozen)
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
    Service for calculating channel balance, frozen amounts, and available funds

    This service aggregates ChannelTransaction records to provide:
    - Total balance (completed transactions)
    - Frozen amount (pending/frozen transactions)
    - Available for withdrawal (balance - frozen)
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
        Calculate balance for a channel

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

        # Calculate balance from completed transactions
        balance_result = ChannelTransaction.objects.filter(
            channel=channel,
            status=ChannelTransaction.TransactionStatus.COMPLETED
        ).aggregate(total=Sum('amount'))

        balance = balance_result['total'] or Decimal('0')

        # Calculate frozen amount from pending and frozen transactions
        frozen_result = ChannelTransaction.objects.filter(
            channel=channel,
            status__in=[
                ChannelTransaction.TransactionStatus.PENDING,
                ChannelTransaction.TransactionStatus.FROZEN
            ]
        ).aggregate(total=Sum('amount'))

        frozen = abs(frozen_result['total'] or Decimal('0'))

        # Calculate available (balance minus frozen)
        available = balance - frozen

        # Ensure available is not negative
        if available < 0:
            available = Decimal('0')

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
        Get balances for multiple channels (optimized for bulk operations)

        Args:
            channels: List of Channel instances

        Returns:
            Dictionary mapping channel_id to ChannelBalance
        """
        from django.db.models import Case, When, Value, CharField

        # Exclude soft-deleted channels
        active_channels = [c for c in channels if not getattr(c, 'is_deleted', False)]
        channel_ids = [str(c.id) for c in active_channels]

        if not channel_ids:
            return {}

        # Pre-aggregate completed transactions
        balance_data = ChannelTransaction.objects.filter(
            channel_id__in=channel_ids,
            status=ChannelTransaction.TransactionStatus.COMPLETED
        ).values('channel_id').annotate(
            total=Sum('amount')
        )

        balances = {str(item['channel_id']): item['total'] or Decimal('0') for item in balance_data}

        # Pre-aggregate frozen transactions
        frozen_data = ChannelTransaction.objects.filter(
            channel_id__in=channel_ids,
            status__in=[
                ChannelTransaction.TransactionStatus.PENDING,
                ChannelTransaction.TransactionStatus.FROZEN
            ]
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
