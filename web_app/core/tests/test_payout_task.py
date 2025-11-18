from decimal import Decimal

import pytest

from core.models import ChannelTransaction, Payout
from core.services import BalanceService
from core.tasks import create_payouts_for_legal_entities
from core.tests.factories import LegalEntityFactory, ChannelFactory


@pytest.mark.django_db
def test_payout_task_creates_when_available_over_minimum(monkeypatch):
    le = LegalEntityFactory()
    channel = ChannelFactory(legal_entity=le, is_deleted=False)

    ChannelTransaction.objects.create(
        channel=channel,
        transaction_type=ChannelTransaction.TransactionType.INCOME,
        amount=Decimal("300.00"),
    )

    result = create_payouts_for_legal_entities(min_amount="100.00")

    assert result["created"] == 1
    payout = Payout.objects.first()
    assert payout.amount == BalanceService.get_legal_entity_balance(le).available


@pytest.mark.django_db
def test_payout_task_skips_when_existing_pending(monkeypatch):
    le = LegalEntityFactory()
    channel = ChannelFactory(legal_entity=le, is_deleted=False)

    ChannelTransaction.objects.create(
        channel=channel,
        transaction_type=ChannelTransaction.TransactionType.INCOME,
        amount=Decimal("150.00"),
    )

    BalanceService.get_legal_entity_balance(le)  # ensure calc ok

    Payout.objects.create(
        legal_entity=le,
        amount=Decimal("150.00"),
        currency="RUB",
        status=Payout.Status.DRAFT,
    )

    result = create_payouts_for_legal_entities(min_amount="100.00")

    assert result["created"] == 0
    assert Payout.objects.count() == 1


@pytest.mark.django_db
def test_payout_task_respects_min_amount(monkeypatch):
    le = LegalEntityFactory()
    channel = ChannelFactory(legal_entity=le, is_deleted=False)

    ChannelTransaction.objects.create(
        channel=channel,
        transaction_type=ChannelTransaction.TransactionType.INCOME,
        amount=Decimal("50.00"),
    )

    result = create_payouts_for_legal_entities(min_amount="100.00")

    assert result["created"] == 0
    assert Payout.objects.count() == 0
