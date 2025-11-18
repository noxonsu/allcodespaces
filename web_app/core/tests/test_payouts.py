from decimal import Decimal
from datetime import date

import pytest
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.db import models
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import ChannelTransaction, Payout
from core.services import BalanceService
from core.tests.factories import ChannelFactory, LegalEntityFactory


@pytest.mark.django_db
class PayoutModelTests(TestCase):
    def setUp(self):
        self.legal_entity = LegalEntityFactory()
        self.channel = ChannelFactory(legal_entity=self.legal_entity, is_deleted=False)

        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("200.00"),
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.FREEZE,
            amount=Decimal("-50.00"),
        )

    def test_save_success_when_amount_within_available(self):
        payout = Payout(
            legal_entity=self.legal_entity,
            amount=Decimal("100.00"),
            currency="RUB",
        )
        payout.save()

        self.assertEqual(payout.status, Payout.Status.DRAFT)
        self.assertEqual(Payout.objects.count(), 1)

    def test_save_fails_when_amount_exceeds_available(self):
        with self.assertRaises(ValidationError):
            Payout(
                legal_entity=self.legal_entity,
                amount=Decimal("1000.00"),
                currency="RUB",
            ).save()

    def test_period_validation(self):
        with self.assertRaises(ValidationError):
            Payout(
                legal_entity=self.legal_entity,
                amount=Decimal("10.00"),
                period_start=date(2025, 12, 31),
                period_end=date(2025, 1, 1),
            ).save()

    def test_legal_entity_balance_service(self):
        totals = BalanceService.get_legal_entity_balance(self.legal_entity)
        self.assertEqual(totals.balance, Decimal("150.00"))
        self.assertEqual(totals.frozen, Decimal("50.00"))
        self.assertEqual(totals.available, Decimal("100.00"))

    def test_paid_payout_creates_channel_transactions_and_reduces_available(self):
        payout = Payout.objects.create(
            legal_entity=self.legal_entity,
            amount=Decimal("80.00"),
            currency="RUB",
            status=Payout.Status.DRAFT,
        )

        payout.status = Payout.Status.PAID
        payout.save()

        txns = ChannelTransaction.objects.filter(source_type="payout", source_id=payout.id)
        self.assertGreater(txns.count(), 0)
        self.assertEqual(txns.aggregate(total=models.Sum("amount"))['total'], Decimal("-80.00"))

        totals = BalanceService.get_legal_entity_balance(self.legal_entity)
        self.assertEqual(totals.available, Decimal("20.00"))


@pytest.mark.django_db
class PayoutAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.legal_entity = LegalEntityFactory()
        self.channel = ChannelFactory(legal_entity=self.legal_entity, is_deleted=False)

        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("120.00"),
        )
        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.FREEZE,
            amount=Decimal("-20.00"),
        )

    def test_create_payout_validates_available(self):
        url = reverse("core:payout-list")
        payload = {
            "legal_entity": str(self.legal_entity.id),
            "amount": "50.00",
            "currency": "RUB",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_payout_rejects_excess_amount(self):
        url = reverse("core:payout-list")
        payload = {
            "legal_entity": str(self.legal_entity.id),
            "amount": "500.00",
            "currency": "RUB",
        }
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount", response.data)
