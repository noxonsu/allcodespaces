from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import ChannelTransaction
from core.tests.factories import ChannelFactory, LegalEntityFactory


class LegalEntityAggregateAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.legal_entity = LegalEntityFactory()

        self.channel1 = ChannelFactory(legal_entity=self.legal_entity, is_deleted=False)
        self.channel2 = ChannelFactory(legal_entity=self.legal_entity, is_deleted=False)

        ChannelTransaction.objects.create(
            channel=self.channel1,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("100.00"),
        )
        ChannelTransaction.objects.create(
            channel=self.channel2,
            transaction_type=ChannelTransaction.TransactionType.INCOME,
            amount=Decimal("50.00"),
        )
        ChannelTransaction.objects.create(
            channel=self.channel2,
            transaction_type=ChannelTransaction.TransactionType.FREEZE,
            amount=Decimal("-20.00"),
        )

    def _decimal(self, value) -> Decimal:
        return Decimal(str(value))

    def test_detail_returns_totals_and_count(self):
        url = reverse("core:legalentity-detail", args=[self.legal_entity.id])
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("total_balance", response.data)
        self.assertIn("total_frozen", response.data)
        self.assertIn("total_available", response.data)
        self.assertEqual(response.data["channels_count"], 2)

        self.assertEqual(self._decimal(response.data["total_balance"]), Decimal("130.00"))
        self.assertEqual(self._decimal(response.data["total_frozen"]), Decimal("20.00"))
        self.assertEqual(self._decimal(response.data["total_available"]), Decimal("110.00"))

    def test_channels_action_paginated_with_balances(self):
        url = reverse("core:legalentity-channels", args=[self.legal_entity.id])
        response = self.client.get(url, {"ordering": "-members_count"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("results", response.data)
        self.assertEqual(response.data.get("count"), 2)
        self.assertEqual(len(response.data["results"]), 2)

        first = response.data["results"][0]
        self.assertIn("balance", first)
        self.assertIn("frozen", first)
        self.assertIn("available", first)
