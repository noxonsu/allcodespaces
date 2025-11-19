"""
CHANGE: Tests for double-entry ledger system
WHY: Comprehensive testing of new Account, LedgerEntry models and DoubleEntryLedgerService
QUOTE(Audit): "Must validate that freeze/unfreeze works correctly with double-entry"
REF: Financial system audit 2025-11-19
"""
import pytest
import uuid
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError

from core.models import Account, LedgerEntry, AccountType, Channel
from core.ledger_service import DoubleEntryLedgerService, ChannelBalance
from core.tests.factories import ChannelFactory, LegalEntityFactory


pytestmark = [pytest.mark.django_db]


class TestAccountModel(TestCase):
    """Tests for Account model"""

    def setUp(self):
        self.channel = ChannelFactory()

    def test_create_accounts(self):
        """Test creating all account types for a channel"""
        for account_type in [AccountType.CASH, AccountType.FROZEN, AccountType.REVENUE, AccountType.EXPENSE]:
            account = Account.objects.create(
                channel=self.channel,
                account_type=account_type,
                currency="RUB"
            )
            self.assertEqual(account.account_type, account_type)
            self.assertEqual(account.currency, "RUB")

    def test_unique_constraint(self):
        """Test that channel+account_type+currency is unique"""
        Account.objects.create(
            channel=self.channel,
            account_type=AccountType.CASH,
            currency="RUB"
        )

        # Should raise error - duplicate
        with self.assertRaises(Exception):  # IntegrityError
            Account.objects.create(
                channel=self.channel,
                account_type=AccountType.CASH,
                currency="RUB"
            )

    def test_account_balance_empty(self):
        """Test balance calculation for empty account"""
        account = Account.objects.create(
            channel=self.channel,
            account_type=AccountType.CASH,
            currency="RUB"
        )
        self.assertEqual(account.balance, Decimal('0'))

    def test_account_balance_with_entries(self):
        """Test balance calculation with debit/credit entries"""
        account = Account.objects.create(
            channel=self.channel,
            account_type=AccountType.CASH,
            currency="RUB"
        )

        tx_id = uuid.uuid4()

        # Debit +1000
        LedgerEntry.objects.create(
            account=account,
            amount=Decimal('1000.00'),
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=tx_id,
            transaction_type=LedgerEntry.TransactionType.INCOME,
            description="Test income"
        )

        # Credit -300
        LedgerEntry.objects.create(
            account=account,
            amount=Decimal('300.00'),
            entry_type=LedgerEntry.EntryType.CREDIT,
            transaction_id=uuid.uuid4(),
            transaction_type=LedgerEntry.TransactionType.FREEZE,
            description="Test freeze"
        )

        # Balance = 1000 - 300 = 700
        self.assertEqual(account.balance, Decimal('700.00'))


class TestLedgerEntryModel(TestCase):
    """Tests for LedgerEntry model"""

    def setUp(self):
        self.channel = ChannelFactory()
        self.account = Account.objects.create(
            channel=self.channel,
            account_type=AccountType.CASH,
            currency="RUB"
        )

    def test_create_entry(self):
        """Test creating a ledger entry"""
        entry = LedgerEntry.objects.create(
            account=self.account,
            amount=Decimal('100.00'),
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=uuid.uuid4(),
            transaction_type=LedgerEntry.TransactionType.INCOME,
            description="Test entry"
        )
        self.assertEqual(entry.amount, Decimal('100.00'))
        self.assertEqual(entry.entry_type, LedgerEntry.EntryType.DEBIT)

    def test_negative_amount_validation(self):
        """Test that negative amounts are rejected"""
        with self.assertRaises(ValidationError):
            entry = LedgerEntry(
                account=self.account,
                amount=Decimal('-100.00'),
                entry_type=LedgerEntry.EntryType.DEBIT,
                transaction_id=uuid.uuid4(),
                transaction_type=LedgerEntry.TransactionType.INCOME,
            )
            entry.save()

    def test_zero_amount_validation(self):
        """Test that zero amounts are rejected"""
        with self.assertRaises(ValidationError):
            entry = LedgerEntry(
                account=self.account,
                amount=Decimal('0.00'),
                entry_type=LedgerEntry.EntryType.DEBIT,
                transaction_id=uuid.uuid4(),
                transaction_type=LedgerEntry.TransactionType.INCOME,
            )
            entry.save()

    def test_immutable_entries(self):
        """Test that entries cannot be modified after creation"""
        entry = LedgerEntry.objects.create(
            account=self.account,
            amount=Decimal('100.00'),
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=uuid.uuid4(),
            transaction_type=LedgerEntry.TransactionType.INCOME,
        )

        # Try to modify
        entry.amount = Decimal('200.00')
        with self.assertRaises(ValidationError) as context:
            entry.save()
        self.assertIn("append-only", str(context.exception))

    def test_no_delete(self):
        """Test that entries cannot be deleted"""
        entry = LedgerEntry.objects.create(
            account=self.account,
            amount=Decimal('100.00'),
            entry_type=LedgerEntry.EntryType.DEBIT,
            transaction_id=uuid.uuid4(),
            transaction_type=LedgerEntry.TransactionType.INCOME,
        )

        with self.assertRaises(ValidationError) as context:
            entry.delete()
        self.assertIn("append-only", str(context.exception))


class TestDoubleEntryLedgerService(TestCase):
    """Tests for DoubleEntryLedgerService"""

    def setUp(self):
        self.channel = ChannelFactory()

    def test_ensure_accounts(self):
        """Test that ensure_accounts creates all required accounts"""
        accounts = DoubleEntryLedgerService.ensure_accounts(self.channel)

        self.assertEqual(len(accounts), 4)
        self.assertIn(AccountType.CASH, accounts)
        self.assertIn(AccountType.FROZEN, accounts)
        self.assertIn(AccountType.REVENUE, accounts)
        self.assertIn(AccountType.EXPENSE, accounts)

    def test_record_income(self):
        """Test recording income (Debit CASH, Credit REVENUE)"""
        tx_id = DoubleEntryLedgerService.record_income(
            channel=self.channel,
            amount=Decimal('1000.00'),
            description="Test income"
        )

        # Check transaction exists
        entries = LedgerEntry.objects.filter(transaction_id=tx_id)
        self.assertEqual(entries.count(), 2)

        # Check debit/credit balance
        from django.db.models import Sum

        debits = entries.filter(entry_type=LedgerEntry.EntryType.DEBIT).aggregate(
            total=Sum('amount')
        )['total']
        credits = entries.filter(entry_type=LedgerEntry.EntryType.CREDIT).aggregate(
            total=Sum('amount')
        )['total']

        self.assertEqual(debits, Decimal('1000.00'))
        self.assertEqual(credits, Decimal('1000.00'))
        self.assertEqual(debits, credits)  # MUST be equal!

        # Check balance
        balance = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=False)
        self.assertEqual(balance.balance, Decimal('1000.00'))
        self.assertEqual(balance.available, Decimal('1000.00'))
        self.assertEqual(balance.frozen, Decimal('0'))

    def test_freeze_unfreeze_cycle(self):
        """Test freeze/unfreeze cycle - THIS WAS BROKEN IN OLD SYSTEM!"""
        # Start with income
        DoubleEntryLedgerService.record_income(
            channel=self.channel,
            amount=Decimal('1000.00'),
        )

        # Freeze 300
        DoubleEntryLedgerService.freeze_amount(
            channel=self.channel,
            amount=Decimal('300.00'),
        )

        balance_after_freeze = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=False)

        # ✅ CRITICAL TEST: Balance should NOT change during freeze!
        self.assertEqual(balance_after_freeze.balance, Decimal('1000.00'),
                         "Balance must NOT change during freeze!")
        self.assertEqual(balance_after_freeze.available, Decimal('700.00'))
        self.assertEqual(balance_after_freeze.frozen, Decimal('300.00'))

        # Unfreeze 300
        DoubleEntryLedgerService.unfreeze_amount(
            channel=self.channel,
            amount=Decimal('300.00'),
        )

        balance_after_unfreeze = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=False)

        # ✅ CRITICAL TEST: After unfreeze, frozen should be 0!
        self.assertEqual(balance_after_unfreeze.balance, Decimal('1000.00'))
        self.assertEqual(balance_after_unfreeze.available, Decimal('1000.00'))
        self.assertEqual(balance_after_unfreeze.frozen, Decimal('0'),
                         "Frozen must be 0 after complete unfreeze!")

    def test_freeze_insufficient_funds(self):
        """Test that freezing more than available fails"""
        DoubleEntryLedgerService.record_income(
            channel=self.channel,
            amount=Decimal('100.00'),
        )

        with self.assertRaises(ValidationError) as context:
            DoubleEntryLedgerService.freeze_amount(
                channel=self.channel,
                amount=Decimal('500.00'),
            )
        self.assertIn("Insufficient", str(context.exception))

    def test_unfreeze_insufficient_frozen(self):
        """Test that unfreezing more than frozen fails"""
        DoubleEntryLedgerService.record_income(
            channel=self.channel,
            amount=Decimal('1000.00'),
        )
        DoubleEntryLedgerService.freeze_amount(
            channel=self.channel,
            amount=Decimal('100.00'),
        )

        with self.assertRaises(ValidationError) as context:
            DoubleEntryLedgerService.unfreeze_amount(
                channel=self.channel,
                amount=Decimal('500.00'),
            )
        self.assertIn("Insufficient", str(context.exception))

    def test_payout(self):
        """Test recording payout (Debit EXPENSE, Credit CASH)"""
        DoubleEntryLedgerService.record_income(
            channel=self.channel,
            amount=Decimal('1000.00'),
        )

        tx_id = DoubleEntryLedgerService.record_payout(
            channel=self.channel,
            amount=Decimal('500.00'),
        )

        # Validate transaction balance
        valid = DoubleEntryLedgerService.validate_transaction_balance(tx_id)
        self.assertTrue(valid)

        # Check balance
        balance = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=False)
        self.assertEqual(balance.balance, Decimal('500.00'))
        self.assertEqual(balance.available, Decimal('500.00'))

    def test_payout_insufficient_funds(self):
        """Test that payout more than available fails"""
        DoubleEntryLedgerService.record_income(
            channel=self.channel,
            amount=Decimal('100.00'),
        )

        with self.assertRaises(ValidationError):
            DoubleEntryLedgerService.record_payout(
                channel=self.channel,
                amount=Decimal('500.00'),
            )

    def test_commission(self):
        """Test recording commission"""
        DoubleEntryLedgerService.record_income(
            channel=self.channel,
            amount=Decimal('1000.00'),
        )

        DoubleEntryLedgerService.record_commission(
            channel=self.channel,
            amount=Decimal('100.00'),
        )

        balance = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=False)
        self.assertEqual(balance.available, Decimal('900.00'))

    def test_complex_scenario(self):
        """Test complex scenario with multiple operations"""
        # Income +1000
        DoubleEntryLedgerService.record_income(self.channel, Decimal('1000.00'))

        # Freeze 300
        DoubleEntryLedgerService.freeze_amount(self.channel, Decimal('300.00'))

        # Commission 50
        DoubleEntryLedgerService.record_commission(self.channel, Decimal('50.00'))

        # Income +500
        DoubleEntryLedgerService.record_income(self.channel, Decimal('500.00'))

        # Unfreeze 100
        DoubleEntryLedgerService.unfreeze_amount(self.channel, Decimal('100.00'))

        # Payout 200
        DoubleEntryLedgerService.record_payout(self.channel, Decimal('200.00'))

        balance = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=False)

        # Balance calculation:
        # CASH: +1000 -300(freeze) -50(comm) +500 +100(unfreeze) -200(payout) = 1050
        # FROZEN: +300(freeze) -100(unfreeze) = 200
        # Total = 1050 + 200 = 1250

        self.assertEqual(balance.available, Decimal('1050.00'))
        self.assertEqual(balance.frozen, Decimal('200.00'))
        self.assertEqual(balance.balance, Decimal('1250.00'))

    def test_balance_bulk_calculation(self):
        """Test bulk balance calculation for multiple channels"""
        from django.db.models import Sum

        channel2 = ChannelFactory()

        DoubleEntryLedgerService.record_income(self.channel, Decimal('1000.00'))
        DoubleEntryLedgerService.record_income(channel2, Decimal('2000.00'))

        balances = DoubleEntryLedgerService.get_balance_for_channels([self.channel, channel2])

        self.assertEqual(len(balances), 2)
        self.assertEqual(balances[str(self.channel.id)].balance, Decimal('1000.00'))
        self.assertEqual(balances[str(channel2.id)].balance, Decimal('2000.00'))

    def test_legal_entity_balance(self):
        """Test aggregate balance for legal entity"""
        legal_entity = LegalEntityFactory()
        channel1 = ChannelFactory(legal_entity=legal_entity, is_deleted=False)
        channel2 = ChannelFactory(legal_entity=legal_entity, is_deleted=False)

        DoubleEntryLedgerService.record_income(channel1, Decimal('1000.00'))
        DoubleEntryLedgerService.record_income(channel2, Decimal('500.00'))
        DoubleEntryLedgerService.freeze_amount(channel1, Decimal('300.00'))

        totals = DoubleEntryLedgerService.get_legal_entity_balance(legal_entity)

        self.assertEqual(totals.balance, Decimal('1500.00'))
        self.assertEqual(totals.frozen, Decimal('300.00'))
        self.assertEqual(totals.available, Decimal('1200.00'))

    def test_soft_deleted_channel(self):
        """Test that soft-deleted channels return zero balance"""
        DoubleEntryLedgerService.record_income(self.channel, Decimal('1000.00'))

        # Soft delete
        self.channel.is_deleted = True
        self.channel.save()

        balance = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=False)

        self.assertEqual(balance.balance, Decimal('0'))
        self.assertEqual(balance.available, Decimal('0'))
        self.assertEqual(balance.frozen, Decimal('0'))

    def test_transaction_validation(self):
        """Test transaction balance validation (debit = credit)"""
        tx_id = DoubleEntryLedgerService.record_income(self.channel, Decimal('1000.00'))

        # Should be valid
        valid = DoubleEntryLedgerService.validate_transaction_balance(tx_id)
        self.assertTrue(valid)

    def test_cache_invalidation(self):
        """Test that cache is invalidated after transactions"""
        # First calculation - should cache
        balance1 = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=True)

        # Add income - should invalidate cache
        DoubleEntryLedgerService.record_income(self.channel, Decimal('1000.00'))

        # Second calculation - should get new value
        balance2 = DoubleEntryLedgerService.calculate_balance(self.channel, use_cache=True)

        self.assertNotEqual(balance1.balance, balance2.balance)
        self.assertEqual(balance2.balance, Decimal('1000.00'))
