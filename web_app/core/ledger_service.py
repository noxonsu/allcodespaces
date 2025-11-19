"""
CHANGE: New BalanceService for double-entry ledger system
WHY: Replace Event Sourcing with proper double-entry bookkeeping
QUOTE(Audit): "Double-entry provides automatic balance validation and proper freeze/unfreeze"
REF: Financial system audit 2025-11-19

Double-entry ledger service with transaction helpers.

Принципы:
- Каждая операция = минимум 2 записи (debit + credit)
- Дебеты ВСЕГДА равны кредитам
- Баланс канала = CASH + FROZEN
- Available = CASH
- Frozen = FROZEN
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.db import transaction as db_transaction
from django.db.models import Sum, Q

from core.models import Channel, Account, LedgerEntry, AccountType, LegalEntity


@dataclass
class ChannelBalance:
    """
    Data class representing channel balance information (double-entry)

    balance: Total balance (CASH + FROZEN)
    frozen: Frozen amount (FROZEN account balance)
    available: Available for withdrawal (CASH account balance)
    """
    balance: Decimal
    frozen: Decimal
    available: Decimal

    def __post_init__(self):
        """Ensure all values are Decimal"""
        self.balance = Decimal(str(self.balance or 0))
        self.frozen = Decimal(str(self.frozen or 0))
        self.available = Decimal(str(self.available or 0))


class DoubleEntryLedgerService:
    """
    Service for managing double-entry ledger operations

    All financial operations use double-entry bookkeeping:
    - Income: Debit CASH, Credit REVENUE
    - Freeze: Debit FROZEN, Credit CASH
    - Unfreeze: Debit CASH, Credit FROZEN
    - Payout: Debit EXPENSE, Credit CASH
    """

    CACHE_TTL = 300  # 5 minutes cache

    @classmethod
    def _get_cache_key(cls, channel_id: str) -> str:
        """Generate cache key for channel balance"""
        return f"channel_balance_v2:{channel_id}"

    @classmethod
    def ensure_accounts(cls, channel: Channel, currency: str = "RUB") -> dict[str, Account]:
        """
        Ensure all required accounts exist for a channel

        Returns:
            Dictionary mapping account_type to Account instance
        """
        accounts = {}
        for account_type in [AccountType.CASH, AccountType.FROZEN, AccountType.REVENUE, AccountType.EXPENSE]:
            account, created = Account.objects.get_or_create(
                channel=channel,
                account_type=account_type,
                currency=currency,
            )
            accounts[account_type] = account
        return accounts

    @classmethod
    def calculate_balance(
        cls,
        channel: Channel,
        use_cache: bool = True
    ) -> ChannelBalance:
        """
        Calculate balance for a channel using double-entry ledger

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

        # Get or create accounts
        accounts = cls.ensure_accounts(channel)

        # Calculate balances for each account
        cash_balance = accounts[AccountType.CASH].balance
        frozen_balance = accounts[AccountType.FROZEN].balance

        # Total balance = CASH + FROZEN
        total_balance = cash_balance + frozen_balance

        # Available = только CASH
        available = max(cash_balance, Decimal('0'))

        # Frozen = FROZEN account balance
        frozen = max(frozen_balance, Decimal('0'))

        result = ChannelBalance(
            balance=total_balance,
            frozen=frozen,
            available=available
        )

        # Cache the result
        if use_cache:
            cache_key = cls._get_cache_key(str(channel.id))
            cache.set(cache_key, {
                'balance': str(total_balance),
                'frozen': str(frozen),
                'available': str(available)
            }, cls.CACHE_TTL)

        return result

    @classmethod
    def invalidate_cache(cls, channel: Channel) -> None:
        """
        Invalidate cached balance for a channel

        Should be called when ledger entries are created
        """
        cache_key = cls._get_cache_key(str(channel.id))
        cache.delete(cache_key)

    @classmethod
    def get_balance_for_channels(cls, channels: list[Channel]) -> dict[str, ChannelBalance]:
        """
        Get balances for multiple channels (bulk calculation)

        Args:
            channels: List of Channel instances

        Returns:
            Dictionary mapping channel_id to ChannelBalance
        """
        # Exclude soft-deleted channels
        active_channels = [c for c in channels if not getattr(c, 'is_deleted', False)]
        channel_ids = [c.id for c in active_channels]

        if not channel_ids:
            return {}

        # Get all accounts for these channels
        accounts = Account.objects.filter(
            channel_id__in=channel_ids,
            account_type__in=[AccountType.CASH, AccountType.FROZEN]
        ).select_related('channel')

        # Build mapping: channel_id -> {account_type -> account}
        channel_accounts = {}
        for account in accounts:
            if account.channel_id not in channel_accounts:
                channel_accounts[account.channel_id] = {}
            channel_accounts[account.channel_id][account.account_type] = account

        # Get balances for all accounts
        account_ids = [a.id for a in accounts]

        # Get debits
        debit_sums = LedgerEntry.objects.filter(
            account_id__in=account_ids,
            entry_type=LedgerEntry.EntryType.DEBIT
        ).values('account_id').annotate(total=Sum('amount'))
        debit_map = {item['account_id']: item['total'] or Decimal('0') for item in debit_sums}

        # Get credits
        credit_sums = LedgerEntry.objects.filter(
            account_id__in=account_ids,
            entry_type=LedgerEntry.EntryType.CREDIT
        ).values('account_id').annotate(total=Sum('amount'))
        credit_map = {item['account_id']: item['total'] or Decimal('0') for item in credit_sums}

        # Calculate balances for each channel
        result = {}
        for channel in active_channels:
            accts = channel_accounts.get(channel.id, {})

            cash_account = accts.get(AccountType.CASH)
            frozen_account = accts.get(AccountType.FROZEN)

            # CASH balance = debit - credit
            cash_balance = Decimal('0')
            if cash_account:
                cash_debit = debit_map.get(cash_account.id, Decimal('0'))
                cash_credit = credit_map.get(cash_account.id, Decimal('0'))
                cash_balance = cash_debit - cash_credit

            # FROZEN balance = debit - credit
            frozen_balance = Decimal('0')
            if frozen_account:
                frozen_debit = debit_map.get(frozen_account.id, Decimal('0'))
                frozen_credit = credit_map.get(frozen_account.id, Decimal('0'))
                frozen_balance = frozen_debit - frozen_credit

            total_balance = cash_balance + frozen_balance
            available = max(cash_balance, Decimal('0'))
            frozen = max(frozen_balance, Decimal('0'))

            result[str(channel.id)] = ChannelBalance(
                balance=total_balance,
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

    @classmethod
    @db_transaction.atomic
    def record_income(
        cls,
        channel: Channel,
        amount: Decimal,
        description: str = "",
        source_type: str = "",
        source_id: Optional[uuid.UUID] = None,
        metadata: Optional[dict] = None,
        currency: str = "RUB"
    ) -> uuid.UUID:
        """
        Record income for a channel (double-entry)

        Debit:  CASH +amount
        Credit: REVENUE +amount

        Returns:
            transaction_id (UUID)
        """
        if amount <= 0:
            raise ValidationError("Amount must be positive")

        accounts = cls.ensure_accounts(channel, currency)
        tx_id = uuid.uuid4()

        # Debit CASH (increases asset)
        LedgerEntry.objects.create(
            account=accounts[AccountType.CASH],
            amount=amount,
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.INCOME,
            description=description or f"Income {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        # Credit REVENUE (increases revenue)
        LedgerEntry.objects.create(
            account=accounts[AccountType.REVENUE],
            amount=amount,
            entry_type=LedgerEntry.EntryType.CREDIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.INCOME,
            description=description or f"Income {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        cls.invalidate_cache(channel)
        return tx_id

    @classmethod
    @db_transaction.atomic
    def freeze_amount(
        cls,
        channel: Channel,
        amount: Decimal,
        description: str = "",
        source_type: str = "",
        source_id: Optional[uuid.UUID] = None,
        metadata: Optional[dict] = None,
        currency: str = "RUB"
    ) -> uuid.UUID:
        """
        Freeze amount (double-entry)

        Debit:  FROZEN +amount
        Credit: CASH -amount

        Returns:
            transaction_id (UUID)
        """
        if amount <= 0:
            raise ValidationError("Amount must be positive")

        accounts = cls.ensure_accounts(channel, currency)
        balance = cls.calculate_balance(channel, use_cache=False)

        # Check if enough available cash
        if balance.available < amount:
            raise ValidationError(f"Insufficient available balance. Available: {balance.available}, requested: {amount}")

        tx_id = uuid.uuid4()

        # Debit FROZEN (increases frozen)
        LedgerEntry.objects.create(
            account=accounts[AccountType.FROZEN],
            amount=amount,
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.FREEZE,
            description=description or f"Freeze {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        # Credit CASH (decreases available)
        LedgerEntry.objects.create(
            account=accounts[AccountType.CASH],
            amount=amount,
            entry_type=LedgerEntry.EntryType.CREDIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.FREEZE,
            description=description or f"Freeze {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        cls.invalidate_cache(channel)
        return tx_id

    @classmethod
    @db_transaction.atomic
    def unfreeze_amount(
        cls,
        channel: Channel,
        amount: Decimal,
        description: str = "",
        source_type: str = "",
        source_id: Optional[uuid.UUID] = None,
        metadata: Optional[dict] = None,
        currency: str = "RUB"
    ) -> uuid.UUID:
        """
        Unfreeze amount (double-entry)

        Debit:  CASH +amount
        Credit: FROZEN -amount

        Returns:
            transaction_id (UUID)
        """
        if amount <= 0:
            raise ValidationError("Amount must be positive")

        accounts = cls.ensure_accounts(channel, currency)
        balance = cls.calculate_balance(channel, use_cache=False)

        # Check if enough frozen funds
        if balance.frozen < amount:
            raise ValidationError(f"Insufficient frozen balance. Frozen: {balance.frozen}, requested: {amount}")

        tx_id = uuid.uuid4()

        # Debit CASH (increases available)
        LedgerEntry.objects.create(
            account=accounts[AccountType.CASH],
            amount=amount,
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.UNFREEZE,
            description=description or f"Unfreeze {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        # Credit FROZEN (decreases frozen)
        LedgerEntry.objects.create(
            account=accounts[AccountType.FROZEN],
            amount=amount,
            entry_type=LedgerEntry.EntryType.CREDIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.UNFREEZE,
            description=description or f"Unfreeze {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        cls.invalidate_cache(channel)
        return tx_id

    @classmethod
    @db_transaction.atomic
    def record_payout(
        cls,
        channel: Channel,
        amount: Decimal,
        description: str = "",
        source_type: str = "payout",
        source_id: Optional[uuid.UUID] = None,
        metadata: Optional[dict] = None,
        currency: str = "RUB"
    ) -> uuid.UUID:
        """
        Record payout from channel (double-entry)

        Debit:  EXPENSE +amount
        Credit: CASH -amount

        Returns:
            transaction_id (UUID)
        """
        if amount <= 0:
            raise ValidationError("Amount must be positive")

        accounts = cls.ensure_accounts(channel, currency)
        balance = cls.calculate_balance(channel, use_cache=False)

        # Check if enough available cash
        if balance.available < amount:
            raise ValidationError(f"Insufficient available balance. Available: {balance.available}, requested: {amount}")

        tx_id = uuid.uuid4()

        # Debit EXPENSE (increases expense)
        LedgerEntry.objects.create(
            account=accounts[AccountType.EXPENSE],
            amount=amount,
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.PAYOUT,
            description=description or f"Payout {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        # Credit CASH (decreases available)
        LedgerEntry.objects.create(
            account=accounts[AccountType.CASH],
            amount=amount,
            entry_type=LedgerEntry.EntryType.CREDIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.PAYOUT,
            description=description or f"Payout {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        cls.invalidate_cache(channel)
        return tx_id

    @classmethod
    @db_transaction.atomic
    def record_commission(
        cls,
        channel: Channel,
        amount: Decimal,
        description: str = "",
        source_type: str = "",
        source_id: Optional[uuid.UUID] = None,
        metadata: Optional[dict] = None,
        currency: str = "RUB"
    ) -> uuid.UUID:
        """
        Record commission deduction (double-entry)

        Debit:  EXPENSE +amount
        Credit: CASH -amount

        Returns:
            transaction_id (UUID)
        """
        if amount <= 0:
            raise ValidationError("Amount must be positive")

        accounts = cls.ensure_accounts(channel, currency)
        balance = cls.calculate_balance(channel, use_cache=False)

        # Check if enough available cash
        if balance.available < amount:
            raise ValidationError(f"Insufficient available balance. Available: {balance.available}, requested: {amount}")

        tx_id = uuid.uuid4()

        # Debit EXPENSE
        LedgerEntry.objects.create(
            account=accounts[AccountType.EXPENSE],
            amount=amount,
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.COMMISSION,
            description=description or f"Commission {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        # Credit CASH
        LedgerEntry.objects.create(
            account=accounts[AccountType.CASH],
            amount=amount,
            entry_type=LedgerEntry.EntryType.CREDIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.COMMISSION,
            description=description or f"Commission {amount}",
            source_type=source_type,
            source_id=source_id,
            metadata=metadata or {}
        )

        cls.invalidate_cache(channel)
        return tx_id

    @classmethod
    def validate_transaction_balance(cls, transaction_id: uuid.UUID) -> bool:
        """
        Validate that debit = credit for a transaction

        Returns:
            True if valid, False otherwise
        """
        entries = LedgerEntry.objects.filter(transaction_id=transaction_id)

        debits = entries.filter(entry_type=LedgerEntry.EntryType.DEBIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        credits = entries.filter(entry_type=LedgerEntry.EntryType.CREDIT).aggregate(
            total=Sum('amount')
        )['total'] or Decimal('0')

        return debits == credits


# Backward compatibility: alias to new service
BalanceService = DoubleEntryLedgerService
