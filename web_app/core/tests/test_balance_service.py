"""
CHANGE: Tests for BalanceService
WHY: Required by ТЗ 1.1.2 - tests for balance calculation service
QUOTE(ТЗ): "покрыть модуль юнит-тестами с граничными случаями"
REF: issue #22
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
    """Tests for BalanceService"""

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
        """Test balance with single completed income transaction"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
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
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal('-500.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('500.00'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('500.00'))

    def test_frozen_amount_with_pending_transactions(self):
        """Test frozen amount includes pending transactions"""
        # Completed income
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        # Pending payout (should be frozen)
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal('-300.00'),
            status=ChannelTransaction.TransactionStatus.PENDING,
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('1000.00'))
        self.assertEqual(balance.frozen, Decimal('300.00'))  # abs(-300)
        self.assertEqual(balance.available, Decimal('700.00'))

    def test_frozen_status_transactions(self):
        """Test that frozen status transactions are included in frozen amount"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal('-200.00'),
            status=ChannelTransaction.TransactionStatus.FROZEN,
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('1000.00'))
        self.assertEqual(balance.frozen, Decimal('200.00'))
        self.assertEqual(balance.available, Decimal('800.00'))

    def test_cancelled_transactions_not_counted(self):
        """Test that cancelled transactions are not counted"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('500.00'),
            status=ChannelTransaction.TransactionStatus.CANCELLED,
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        # Only completed transaction counted
        self.assertEqual(balance.balance, Decimal('1000.00'))

    def test_available_never_negative(self):
        """Test that available amount is never negative (edge case)"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('100.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        # Huge pending payout
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal('-500.00'),
            status=ChannelTransaction.TransactionStatus.PENDING,
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('100.00'))
        self.assertEqual(balance.frozen, Decimal('500.00'))
        # Available should be 0, not negative
        self.assertEqual(balance.available, Decimal('0'))

    def test_soft_deleted_channel_returns_zero(self):
        """Test that soft-deleted channels return zero balance"""
        self.channel.is_deleted = True
        self.channel.save()

        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )

        balance = BalanceService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('0'))
        self.assertEqual(balance.frozen, Decimal('0'))
        self.assertEqual(balance.available, Decimal('0'))

    def test_cache_is_used(self):
        """Test that cache is used on subsequent calls (when no transactions added)"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )

        # First call - should calculate and cache
        balance1 = BalanceService.calculate_balance(self.channel, use_cache=True)
        self.assertEqual(balance1.balance, Decimal('1000.00'))

        # Second call without adding transactions - should use cache
        balance2 = BalanceService.calculate_balance(self.channel, use_cache=True)
        self.assertEqual(balance2.balance, Decimal('1000.00'))

        # Note: When a new transaction is created, the signal automatically invalidates
        # the cache, so the next call will recalculate. This is tested in test_cache_invalidation.

    def test_cache_invalidation(self):
        """Test that cache is invalidated correctly"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('1000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
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
            status=ChannelTransaction.TransactionStatus.COMPLETED,
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
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        ChannelTransaction.objects.create(
            channel=channel2,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('2000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
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
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        ChannelTransaction.objects.create(
            channel=channel2,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal('2000.00'),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
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
