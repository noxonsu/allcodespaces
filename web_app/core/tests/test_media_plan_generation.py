"""
Tests for Excel media plan generator service.

CHANGE: Verifies template output required by issues #49-#50.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from io import BytesIO

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from openpyxl import load_workbook

from core.media_plan import MediaPlanGenerator
from core.models import Campaign, MediaPlanGeneration
from core.tests.factories import (
    CampaignFactory,
    CampaignChannelFactory,
    ChannelFactory,
    UserFactory,
)


class MediaPlanGeneratorTests(TestCase):
    def test_generator_builds_expected_rows_and_workbook(self):
        campaign = CampaignFactory(name="Premium Launch", budget=5000)
        channel = ChannelFactory()
        CampaignChannelFactory(
            campaign=campaign,
            channel=channel,
            impressions_plan=1500,
            impressions_fact=1200,
            clicks=300,
        )

        generator = MediaPlanGenerator()
        queryset = Campaign.objects.filter(id=campaign.id)
        result = generator.generate(queryset)

        self.assertEqual(len(result.rows), 1)
        row = result.rows[0]
        self.assertEqual(row["campaign_name"], "Premium Launch")
        self.assertEqual(row["channels_count"], 1)
        self.assertEqual(row["impressions_plan"], 1500)
        self.assertEqual(result.totals["campaigns"], 1)
        self.assertEqual(result.totals["clicks"], 300)

        workbook = load_workbook(BytesIO(result.content))
        sheet = workbook.active
        self.assertEqual(sheet["A1"].value, "ID кампании")
        self.assertEqual(sheet["B2"].value, "Premium Launch")
        self.assertEqual(sheet["L2"].value, 1500)


class MediaPlanGenerationHistoryTests(TestCase):
    def setUp(self):
        self.media_root = tempfile.mkdtemp(prefix="mediaplan_history_")
        self.override = override_settings(MEDIA_ROOT=self.media_root)
        self.override.enable()
        self.user = UserFactory(is_staff=True, is_superuser=True)

    def tearDown(self):
        self.override.disable()
        shutil.rmtree(self.media_root, ignore_errors=True)

    def test_history_record_persists_file_and_metadata(self):
        campaign = CampaignFactory()
        generator = MediaPlanGenerator()
        result = generator.generate(Campaign.objects.filter(id=campaign.id))

        record = MediaPlanGeneration.objects.create(requested_by=self.user)
        record.campaigns.add(campaign)
        record.file.save(
            f"{record.id}_{result.filename}",
            ContentFile(result.content),
            save=False,
        )
        record.mark_success(rows_count=len(result.rows), metadata=result.totals)
        record.save()

        self.assertEqual(MediaPlanGeneration.objects.count(), 1)
        stored = MediaPlanGeneration.objects.first()
        self.assertTrue(os.path.exists(stored.file.path))
        self.assertEqual(stored.metadata["campaigns"], 1)
