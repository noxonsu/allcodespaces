"""
CHANGE: Tests for ChannelTransaction model
WHY: Required by ТЗ 1.1.1 - tests for financial operations model
QUOTE(ТЗ): "тесты покрывают модель и сериализацию"
REF: issue #21
"""
import pytest
from decimal import Decimal
from django.test import TestCase
from django.core.exceptions import ValidationError

from core.models import ChannelTransaction, Channel
from core.tests.factories import ChannelTransactionFactory, ChannelFactory


pytestmark = [pytest.mark.django_db]


class TestChannelTransaction(TestCase):
    """Tests for ChannelTransaction model"""

    def setUp(self):
        """Set up test data"""
        self.channel = ChannelFactory()

    def test_create_income_transaction(self):
        """Test creating income transaction with positive amount"""
        transaction = ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("1000.00"),
            status=ChannelTransaction.TransactionStatus.COMPLETED,
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
            status=ChannelTransaction.TransactionStatus.COMPLETED,
        )
        transaction.full_clean()

        self.assertEqual(transaction.amount, Decimal("-500.00"))
        self.assertEqual(transaction.transaction_type, ChannelTransaction.TransactionType.PAYOUT)

    def test_income_negative_amount_validation(self):
        """Test that income cannot have negative amount"""
        transaction = ChannelTransaction(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("-100.00"),
        )

        with self.assertRaises(ValidationError) as context:
            transaction.full_clean()

        self.assertIn("amount", context.exception.message_dict)

    def test_payout_positive_amount_validation(self):
        """Test that payout cannot have positive amount"""
        transaction = ChannelTransaction(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal("100.00"),
        )

        with self.assertRaises(ValidationError) as context:
            transaction.full_clean()

        self.assertIn("amount", context.exception.message_dict)

    def test_deduction_positive_amount_validation(self):
        """Test that deduction cannot have positive amount"""
        transaction = ChannelTransaction(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.DEDUCTION,
            amount=Decimal("100.00"),
        )

        with self.assertRaises(ValidationError) as context:
            transaction.full_clean()

        self.assertIn("amount", context.exception.message_dict)

    def test_refund_negative_amount_validation(self):
        """Test that refund cannot have negative amount"""
        transaction = ChannelTransaction(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.REFUND,
            amount=Decimal("-100.00"),
        )

        with self.assertRaises(ValidationError) as context:
            transaction.full_clean()

        self.assertIn("amount", context.exception.message_dict)

    def test_transaction_status_choices(self):
        """Test all transaction status choices"""
        for status_value, _ in ChannelTransaction.TransactionStatus.choices:
            transaction = ChannelTransaction.objects.create(
                channel=self.channel,
                transaction_type=ChannelTransaction.TransactionType.INCOME,
                amount=Decimal("100.00"),
                status=status_value,
            )
            self.assertEqual(transaction.status, status_value)

    def test_transaction_type_choices(self):
        """Test all transaction type choices"""
        type_amounts = {
            ChannelTransaction.TransactionType.INCOME: Decimal("100.00"),
            ChannelTransaction.TransactionType.DEDUCTION: Decimal("-100.00"),
            ChannelTransaction.TransactionType.PAYOUT: Decimal("-100.00"),
            ChannelTransaction.TransactionType.REFUND: Decimal("100.00"),
        }

        for type_value, amount in type_amounts.items():
            transaction = ChannelTransaction.objects.create(
                channel=self.channel,
                transaction_type=type_value,
                amount=amount,
            )
            self.assertEqual(transaction.transaction_type, type_value)

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
        # Manually set older timestamp
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

        expected = f"Начисление 1000.00 RUB - {self.channel.name}"
        self.assertEqual(str(transaction), expected)

    def test_factory_creates_valid_transactions(self):
        """Test that factory creates valid transactions"""
        transaction = ChannelTransactionFactory()
        transaction.full_clean()  # Should not raise

        self.assertIsNotNone(transaction.id)
        self.assertIsNotNone(transaction.channel)
        self.assertIn(transaction.transaction_type, [choice[0] for choice in ChannelTransaction.TransactionType.choices])
