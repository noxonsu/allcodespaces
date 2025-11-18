from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from core.models import ChannelTransaction
from core.tests.factories import ChannelFactory


class ChannelBalanceAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.channel = ChannelFactory(is_deleted=False)

    def _decimal(self, value) -> Decimal:
        return Decimal(str(value))

    def test_balance_fields_exposed_and_refreshed(self):
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

        url = reverse("core:channel-detail", args=[self.channel.tg_id])

        first_response = self.client.get(url)
        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertIn("balance", first_response.data)
        self.assertIn("frozen", first_response.data)
        self.assertIn("available", first_response.data)

        self.assertEqual(self._decimal(first_response.data["balance"]), Decimal("100.00"))
        self.assertEqual(self._decimal(first_response.data["frozen"]), Decimal("20.00"))
        self.assertEqual(self._decimal(first_response.data["available"]), Decimal("80.00"))

        ChannelTransaction.objects.create(
            channel=self.channel,
            transaction_type=ChannelTransaction.TransactionType.PAYOUT,
            amount=Decimal("-50.00"),
        )

        second_response = self.client.get(url)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self._decimal(second_response.data["balance"]), Decimal("50.00"))
        self.assertEqual(self._decimal(second_response.data["frozen"]), Decimal("20.00"))
        self.assertEqual(self._decimal(second_response.data["available"]), Decimal("30.00"))

    def test_core_prefixed_channel_endpoint_is_available(self):
        url = f"/core/channel/{self.channel.tg_id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("balance", response.data)
        self.assertIn("frozen", response.data)
        self.assertIn("available", response.data)
