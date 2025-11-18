"""
CHANGE: Refactored tests for Event Sourcing approach
WHY: ChannelTransaction model refactored to append-only ledger without statuses
QUOTE(ТЗ): "Event Sourcing - баланс = SUM(transactions). Нет race — только append"
REF: issue #22 (refactoring)
"""
import pytest
from decimal import Decimal
from django.contrib.admin.sites import AdminSite
from django.contrib.auth import get_user_model
from django.test import RequestFactory, TestCase
from django.core.exceptions import ValidationError

from core.admin import ChannelTransactionAdmin
from core.models import ChannelTransaction, Channel
from core.tests.factories import ChannelTransactionFactory, ChannelFactory


pytestmark = [pytest.mark.django_db]


class TestChannelTransaction(TestCase):
    """Tests for ChannelTransaction model (Event Sourcing approach)"""

    def setUp(self):
        """Set up test data"""
        self.channel = ChannelFactory()

    def test_create_income_transaction(self):
        """Test creating income transaction with positive amount"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("1000.00"),
        )
        transaction.full_clean()

        self.assertEqual(transaction.amount, Decimal("1000.00"))
        self.assertEqual(transaction.transaction_type, ChannelTransaction.TransactionType.INCOME)
        self.assertEqual(transaction.currency, "RUB")

    def test_create_payout_transaction(self):
        """Test creating payout transaction with negative amount"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal("-500.00"),
        )
        transaction.full_clean()

        self.assertEqual(transaction.amount, Decimal("-500.00"))
        self.assertEqual(transaction.transaction_type, ChannelTransaction.TransactionType.PAYOUT)

    def test_create_freeze_transaction(self):
        """Test creating freeze transaction with negative amount"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.FREEZE,
            amount=Decimal("-100.00"),
        )
        transaction.full_clean()

        self.assertEqual(transaction.amount, Decimal("-100.00"))
        self.assertEqual(transaction.transaction_type, ChannelTransaction.TransactionType.FREEZE)

    def test_create_unfreeze_transaction(self):
        """Test creating unfreeze transaction with positive amount"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.UNFREEZE,
            amount=Decimal("100.00"),
        )
        transaction.full_clean()

        self.assertEqual(transaction.amount, Decimal("100.00"))
        self.assertEqual(transaction.transaction_type, ChannelTransaction.TransactionType.UNFREEZE)

    def test_transaction_type_choices(self):
        """Test all transaction type choices"""
        type_amounts = {
            # Положительные операции
            ChannelTransaction.TransactionType.INCOME: Decimal("100.00"),
            ChannelTransaction.TransactionType.REFUND: Decimal("100.00"),
            ChannelTransaction.TransactionType.UNFREEZE: Decimal("100.00"),
            # Отрицательные операции
            ChannelTransaction.TransactionType.FREEZE: Decimal("-100.00"),
            ChannelTransaction.TransactionType.PAYOUT: Decimal("-100.00"),
            ChannelTransaction.TransactionType.COMMISSION: Decimal("-100.00"),
            ChannelTransaction.TransactionType.ADJUSTMENT: Decimal("-100.00"),
        }

        for type_value, amount in type_amounts.items():
            transaction = ChannelTransaction.objects.create(
                channel=self.channel,
                transaction_type=type_value,
                amount=amount,
            )
            self.assertEqual(transaction.transaction_type, type_value)

    def test_append_only_no_updates(self):
        """Test that transactions cannot be updated (append-only)"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("100.00"),
        )

        # Try to update - should raise ValidationError
        transaction.amount = Decimal("200.00")
        with self.assertRaises(ValidationError) as context:
            transaction.save()

        self.assertIn("append-only", str(context.exception))

    def test_append_only_no_deletes(self):
        """Test that transactions cannot be deleted (append-only)"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("100.00"),
        )

        # Try to delete - should raise ValidationError
        with self.assertRaises(ValidationError) as context:
            transaction.delete()

        self.assertIn("append-only", str(context.exception))

    def test_transaction_with_metadata(self):
        """Test transaction with JSON metadata"""
        metadata = {
            "campaign_id": "abc123",
            "publication_date": "2025-01-15",
            "notes": "Test transaction"
        }
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("1500.00"),
            metadata=metadata,
        )

        self.assertEqual(transaction.metadata, metadata)

    def test_transaction_with_source(self):
        """Test transaction with source information"""
        import uuid
        source_id = uuid.uuid4()

        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("1000.00"),
            source_type="publication",
            source_id=source_id,
        )

        self.assertEqual(transaction.source_type, "publication")
        self.assertEqual(transaction.source_id, source_id)

    def test_channel_transactions_relationship(self):
        """Test reverse relationship from channel to transactions"""
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("100.00"),
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal("-50.00"),
        )

        transactions = self.channel.transactions.all()
        self.assertEqual(transactions.count(), 2)

    def test_transaction_ordering(self):
        """Test that transactions are ordered by created_at descending"""
        from datetime import timedelta
        from django.utils import timezone

        # Create transactions with different timestamps
        old_transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("100.00"),
        )
        # Manually set older timestamp (only allowed for testing via update)
        ChannelTransaction.objects.filter(pk=old_transaction.pk).update(
            created_at=timezone.now() - timedelta(days=1)
        )

        new_transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("200.00"),
        )

        transactions = ChannelTransaction.objects.all()
        self.assertEqual(transactions.first().id, new_transaction.id)

    def test_transaction_str_representation(self):
        """Test string representation of transaction"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("1000.00"),
            currency="RUB",
        )

        expected = f"Начисление +1000.00 RUB - {self.channel.name}"
        self.assertEqual(str(transaction), expected)

    def test_factory_creates_valid_transactions(self):
        """Test that factory creates valid transactions"""
        transaction = ChannelTransactionFactory()
        transaction.full_clean()  # Should not raise

        self.assertIsNotNone(transaction.id)
        self.assertIsNotNone(transaction.channel)
        self.assertIn(transaction.transaction_type, [choice[0] for choice in ChannelTransaction.TransactionType.choices])

    def test_compensating_transaction_pattern(self):
        """Test compensating transaction pattern for corrections"""
        # Original income
        original = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("1000.00"),
            description="Original income",
        )

        # If we need to "cancel" it, create compensating adjustment
        compensation = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.ADJUSTMENT,
            amount=Decimal("-1000.00"),
            description=f"Compensation for transaction {original.id}",
            metadata={"compensates": str(original.id)},
        )

        # Both transactions exist in ledger
        self.assertEqual(ChannelTransaction.objects.count(), 2)

        # Net effect is zero
        from django.db.models import Sum
        total = ChannelTransaction.objects.filter(channel=self.channel).aggregate(
            total=Sum('amount')
        )['total']
        self.assertEqual(total, Decimal("0.00"))


class TestChannelTransactionAdmin(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.user = get_user_model().objects.create_superuser(
            username="admin",
            email="admin@example.com",
            password="password",
        )
        self.model_admin = ChannelTransactionAdmin(ChannelTransaction, AdminSite())

    def test_delete_is_disabled(self):
        request = self.factory.get("/")
        request.user = self.user

        self.assertFalse(self.model_admin.has_delete_permission(request))
        self.assertNotIn("delete_selected", self.model_admin.get_actions(request))
