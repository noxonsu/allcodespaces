from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from core.models import Campaign, PlacementFormat
from core.tests.factories import CampaignFactory, MessageFactory


class CampaignStatusTransitionTests(TestCase):
    def test_default_status_is_draft(self):
        message = MessageFactory()
        campaign = Campaign.objects.create(
            name="Draft campaign",
            budget=Decimal("100.00"),
            message=message,
            start_date=timezone.now().date(),
            finish_date=timezone.now().date(),
            format=PlacementFormat.FIXED_SLOT,
        )

        self.assertEqual(campaign.status, Campaign.Statuses.DRAFT)

    def test_allows_draft_to_paused(self):
        self._assert_transition_allowed(
            start_status=Campaign.Statuses.DRAFT,
            target_status=Campaign.Statuses.PAUSED,
        )

    def test_allows_draft_to_active(self):
        self._assert_transition_allowed(
            start_status=Campaign.Statuses.DRAFT,
            target_status=Campaign.Statuses.ACTIVE,
        )

    def test_allows_paused_to_active(self):
        self._assert_transition_allowed(
            start_status=Campaign.Statuses.PAUSED,
            target_status=Campaign.Statuses.ACTIVE,
        )

    def test_allows_active_to_paused(self):
        self._assert_transition_allowed(
            start_status=Campaign.Statuses.ACTIVE,
            target_status=Campaign.Statuses.PAUSED,
        )

    def test_forbid_active_to_draft(self):
        self._assert_transition_denied(
            start_status=Campaign.Statuses.ACTIVE,
            target_status=Campaign.Statuses.DRAFT,
        )

    def test_forbid_paused_to_draft(self):
        self._assert_transition_denied(
            start_status=Campaign.Statuses.PAUSED,
            target_status=Campaign.Statuses.DRAFT,
        )

    def _assert_transition_allowed(self, *, start_status: str, target_status: str):
        campaign = CampaignFactory(status=start_status)
        campaign.status = target_status

        campaign.full_clean()
        campaign.save(update_fields=["status"])
        campaign.refresh_from_db()

        self.assertEqual(campaign.status, target_status)

    def _assert_transition_denied(self, *, start_status: str, target_status: str):
        campaign = CampaignFactory(status=start_status)
        campaign.status = target_status

        with self.assertRaises(ValidationError):
            campaign.full_clean()
