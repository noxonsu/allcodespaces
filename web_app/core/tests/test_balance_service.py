"""
CHANGE: Refactored tests for Event Sourcing approach
WHY: BalanceService refactored to Event Sourcing - removed status-based logic
QUOTE(ТЗ): "Event Sourcing - баланс = SUM(transactions). Нет race — только append"
REF: issue #22 (refactoring)
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.core.cache import cache

from core.models import ChannelTransaction
from core.services import BalanceService, ChannelBalance
from core.tests.factories import ChannelFactory, ChannelTransactionFactory


pytestmark = [pytest.mark.django_db]


class TestBalanceService(TestCase):
    """Tests for BalanceService (Event Sourcing approach)"""

    def setUp(self):
        """Set up test data"""
        self.channel = ChannelFactory()
        # Clear cache before each test
        cache.clear()

    def tearDown(self):
        """Clear cache after each test"""
        cache.clear()

    def test_balance_with_no_transactions(self):
        """Test balance calculation when no transactions exist"""
        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('0'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('0'))

    def test_balance_with_single_income(self):
        """Test balance with single income transaction"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('1000.00'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('1000.00'))

    def test_balance_with_income_and_payout(self):
        """Test balance with income and payout"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal('-500.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('500.00'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('500.00'))

    def test_freeze_and_unfreeze(self):
        """Test freeze and unfreeze operations (Event Sourcing)"""
        # Income
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )
        # Freeze part of it
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.FREEZE,
            amount=Decimal('-300.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        # Balance = 1000 - 300 = 700
        self.assertEqual(balance.balance, Decimal('700.00'))
        # Frozen = ABS(-300) = 300
        self.assertEqual(balance.frozen, Decimal('300.00'))
        # Available = 700 - 300 = 400
        self.assertEqual(balance.available, Decimal('400.00'))

        # Now unfreeze
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.UNFREEZE,
            amount=Decimal('300.00'),
        )

        balance2 = BalanceService.calculate_balance(self.channel, use_cache=False)

        # Balance = 1000 - 300 + 300 = 1000
        self.assertEqual(balance2.balance, Decimal('1000.00'))
        # Frozen только freeze транзакции = 300
        self.assertEqual(balance2.frozen, Decimal('300.00'))
        # Available = 1000 - 300 = 700
        self.assertEqual(balance2.available, Decimal('700.00'))

    def test_commission_deduction(self):
        """Test commission deduction"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.COMMISSION,
            amount=Decimal('-50.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('950.00'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('950.00'))

    def test_adjustment_transaction(self):
        """Test adjustment (compensating) transactions"""
        # Original income
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )
        # Adjustment (correction)
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.ADJUSTMENT,
            amount=Decimal('-200.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('800.00'))

    def test_refund_transaction(self):
        """Test refund increases balance"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal('-500.00'),
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.REFUND,
            amount=Decimal('500.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        # Net zero
        self.assertEqual(balance.balance, Decimal('0.00'))

    def test_available_never_negative(self):
        """Test that available amount is never negative (edge case)"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('100.00'),
        )
        # Huge freeze
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.FREEZE,
            amount=Decimal('-500.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        # Balance = 100 - 500 = -400
        self.assertEqual(balance.balance, Decimal('-400.00'))
        # Frozen = ABS(-500) = 500
        self.assertEqual(balance.frozen, Decimal('500.00'))
        # Available = max(-400 - 500, 0) = 0
        self.assertEqual(balance.available, Decimal('0'))

    def test_soft_deleted_channel_returns_zero(self):
        """Test that soft-deleted channels return zero balance"""
        self.channel.is_deleted = True
        self.channel.save()

        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('0'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('0'))

    def test_cache_is_used(self):
        """Test that cache is used on subsequent calls"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )

        # First call - should calculate and cache
        balance1 = BalanceService.calculate_balance(self.channel, use_cache=True)
        self.assertEqual(balance1.balance, Decimal('1000.00'))

        # Second call - should use cache
        balance2 = BalanceService.calculate_balance(self.channel, use_cache=True)
        self.assertEqual(balance2.balance, Decimal('1000.00'))

    def test_cache_invalidation(self):
        """Test that cache is invalidated correctly"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )

        # Cache the result
        balance1 = BalanceService.calculate_balance(self.channel, use_cache=True)
        self.assertEqual(balance1.balance, Decimal('1000.00'))

        # Invalidate cache
        BalanceService.invalidate_cache(self.channel)

        # Add new transaction
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('500.00'),
        )

        # Should recalculate because cache was invalidated
        balance2 = BalanceService.calculate_balance(self.channel, use_cache=True)
        self.assertEqual(balance2.balance, Decimal('1500.00'))

    def test_bulk_balance_calculation(self):
        """Test get_balance_for_channels for multiple channels"""
        channel1 = ChannelFactory()
        channel2 = ChannelFactory()

        ChannelTransaction.objects.create(
            channel=channel1,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )
        ChannelTransaction.objects.create(
            channel=channel2,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('2000.00'),
        )

        balances = BalanceService.get_balance_for_channels([channel1, channel2])

        self.assertEqual(len(balances), 2)
        self.assertEqual(balances[str(channel1.id)].balance, Decimal('1000.00'))
        self.assertEqual(balances[str(channel2.id)].balance, Decimal('2000.00'))

    def test_bulk_excludes_soft_deleted(self):
        """Test that bulk operation excludes soft-deleted channels"""
        channel1 = ChannelFactory()
        channel2 = ChannelFactory(is_deleted=True)

        ChannelTransaction.objects.create(
            channel=channel1,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )
        ChannelTransaction.objects.create(
            channel=channel2,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('2000.00'),
        )

        balances = BalanceService.get_balance_for_channels([channel1, channel2])

        # Only channel1 should be in results
        self.assertEqual(len(balances), 1)
        self.assertIn(str(channel1.id), balances)
        self.assertNotIn(str(channel2.id), balances)

    def test_channel_balance_dataclass(self):
        """Test ChannelBalance dataclass initialization"""
        balance = ChannelBalance(
            balance=Decimal('1000.00'),
            frozen=Decimal('200.00'),
            available=Decimal('800.00')
        )

        self.assertIsInstance(balance.balance, Decimal)
        self.assertIsInstance(balance.frozen, Decimal)
        self.assertIsInstance(balance.available, Decimal)

    def test_channel_balance_handles_none_values(self):
        """Test that ChannelBalance converts None to Decimal 0"""
        balance = ChannelBalance(
            balance=None,
            frozen=None,
            available=None
        )

        self.assertEqual(balance.balance, Decimal('0'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('0'))

    def test_complex_transaction_sequence(self):
        """Test complex sequence of transactions (Event Sourcing advantage)"""
        # Income
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
        )
        # Freeze part
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.FREEZE,
            amount=Decimal('-200.00'),
        )
        # Commission
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.COMMISSION,
            amount=Decimal('-50.00'),
        )
        # Payout
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal('-300.00'),
        )
        # Unfreeze
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.UNFREEZE,
            amount=Decimal('200.00'),
        )
        # Refund
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.REFUND,
            amount=Decimal('100.00'),
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        # Balance = 1000 - 200 - 50 - 300 + 200 + 100 = 750
        self.assertEqual(balance.balance, Decimal('750.00'))
        # Frozen = только freeze транзакции = ABS(-200) = 200
        self.assertEqual(balance.frozen, Decimal('200.00'))
        # Available = 750 - 200 = 550
        self.assertEqual(balance.available, Decimal('550.00'))
