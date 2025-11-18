"""
CHANGE: Tests for Channel-LegalEntity binding
WHY: Required by ТЗ 1.2.2 - tests for channel-legal entity relationship
QUOTE(ТЗ): "автотесты подтверждают сохранение/валидации"
REF: issue #25
"""
import pytest
from django.test import TestCase

from core.models import Channel, LegalEntity


pytestmark = [pytest.mark.django_db]


class TestChannelLegalEntityBinding(TestCase):
    """Tests for Channel and LegalEntity relationship"""

    def setUp(self):
        """Set up test data"""
        self.legal_entity = LegalEntity.objects.create(
            name="ООО Тестовая Компания",
            short_name="ООО Тест",
            inn="7743013902",
            status=LegalEntity.Status.ACTIVE,
        )

    def test_channel_can_have_legal_entity(self):
        """Test that channel can be assigned to a legal entity"""
        channel = Channel.objects.create(
            name="Test Channel",
            tg_id="12345",
            legal_entity=self.legal_entity,
        )

        self.assertEqual(channel.legal_entity, self.legal_entity)
        self.assertIn(channel, self.legal_entity.channels.all())

    def test_channel_legal_entity_is_optional(self):
        """Test that legal_entity field is optional"""
        channel = Channel.objects.create(
            name="Test Channel",
            tg_id="12345",
        )

        self.assertIsNone(channel.legal_entity)

    def test_channel_legal_entity_can_be_null(self):
        """Test that channel can exist without legal entity"""
        channel = Channel.objects.create(
            name="Test Channel",
            tg_id="12345",
            legal_entity=None,
        )
        channel.full_clean(exclude=["avatar_url"])
        channel.save()

        self.assertIsNone(channel.legal_entity)

    def test_channel_legal_entity_can_be_changed(self):
        """Test that channel's legal entity can be changed"""
        entity2 = LegalEntity.objects.create(
            name="ООО Другая Компания",
            inn="7707123456",
        )

        channel = Channel.objects.create(
            name="Test Channel",
            tg_id="12345",
            legal_entity=self.legal_entity,
        )

        self.assertEqual(channel.legal_entity, self.legal_entity)

        # Change legal entity
        channel.legal_entity = entity2
        channel.save()

        self.assertEqual(channel.legal_entity, entity2)
        self.assertNotIn(channel, self.legal_entity.channels.all())
        self.assertIn(channel, entity2.channels.all())

    def test_channel_legal_entity_can_be_removed(self):
        """Test that legal entity can be removed from channel"""
        channel = Channel.objects.create(
            name="Test Channel",
            tg_id="12345",
            legal_entity=self.legal_entity,
        )

        # Remove legal entity
        channel.legal_entity = None
        channel.save()

        self.assertIsNone(channel.legal_entity)
        self.assertNotIn(channel, self.legal_entity.channels.all())

    def test_legal_entity_deletion_sets_null(self):
        """Test that deleting legal entity sets channel.legal_entity to NULL"""
        channel = Channel.objects.create(
            name="Test Channel",
            tg_id="12345",
            legal_entity=self.legal_entity,
        )

        entity_id = self.legal_entity.id
        self.legal_entity.delete()

        channel.refresh_from_db()
        self.assertIsNone(channel.legal_entity)

    def test_multiple_channels_same_legal_entity(self):
        """Test that multiple channels can belong to same legal entity"""
        channel1 = Channel.objects.create(
            name="Test Channel 1",
            tg_id="12345",
            legal_entity=self.legal_entity,
        )
        channel2 = Channel.objects.create(
            name="Test Channel 2",
            tg_id="67890",
            legal_entity=self.legal_entity,
        )

        self.assertEqual(channel1.legal_entity, self.legal_entity)
        self.assertEqual(channel2.legal_entity, self.legal_entity)
        self.assertEqual(self.legal_entity.channels.count(), 2)
        self.assertIn(channel1, self.legal_entity.channels.all())
        self.assertIn(channel2, self.legal_entity.channels.all())

    def test_legal_entity_channels_reverse_relationship(self):
        """Test reverse relationship from legal entity to channels"""
        channel1 = Channel.objects.create(
            name="Channel 1",
            tg_id="111",
            legal_entity=self.legal_entity,
        )
        channel2 = Channel.objects.create(
            name="Channel 2",
            tg_id="222",
            legal_entity=self.legal_entity,
        )

        # Test reverse lookup
        channels = self.legal_entity.channels.all()
        self.assertEqual(channels.count(), 2)
        self.assertIn(channel1, channels)
        self.assertIn(channel2, channels)
