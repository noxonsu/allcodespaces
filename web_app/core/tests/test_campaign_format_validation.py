from datetime import datetime
from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.test import TestCase

from core.models import Campaign, PlacementFormat
from core.tests.factories import CampaignFactory, MessageFactory


@pytest.mark.django_db
class CampaignFormatValidationTests(TestCase):
    def test_cannot_change_format_after_create(self):
        campaign = CampaignFactory(format=PlacementFormat.SPONSORSHIP, message=MessageFactory())
        campaign.format = PlacementFormat.AUTOPILOT

        with self.assertRaises(ValidationError):
            campaign.full_clean()

    def test_fixed_slot_requires_datetime(self):
        campaign = Campaign(
            name="Test",
            format=PlacementFormat.FIXED_SLOT,
            status=Campaign.Statuses.DRAFT,
            budget=Decimal("100.00"),
            start_date=datetime.today().date(),
            finish_date=datetime.today().date(),
            message=MessageFactory(),
        )

        with self.assertRaises(ValidationError):
            campaign.full_clean()
