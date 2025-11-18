"""
CHANGE: Tests for LegalEntity model
WHY: Required by ТЗ 1.2 - tests coverage for legal entities
QUOTE(ТЗ): "тесты покрывают модель"
REF: issue #24
"""
import pytest
from django.core.exceptions import ValidationError
from django.test import TestCase

from core.models import LegalEntity


pytestmark = [pytest.mark.django_db]


class TestLegalEntityModel(TestCase):
    """Tests for LegalEntity model"""

    def test_create_legal_entity_success(self):
        """Test creating a valid legal entity"""
        entity = LegalEntity.objects.create(
            name="ООО Тестовая Компания",
            short_name="ООО Тест",
            inn="7743013902",
            kpp="774301001",
            status=LegalEntity.Status.ACTIVE,
        )
        entity.full_clean()
        entity.save()

        self.assertEqual(entity.name, "ООО Тестовая Компания")
        self.assertEqual(entity.short_name, "ООО Тест")
        self.assertEqual(entity.inn, "7743013902")
        self.assertEqual(entity.status, LegalEntity.Status.ACTIVE)
        self.assertTrue(entity.is_active)

    def test_legal_entity_str_method(self):
        """Test string representation"""
        entity = LegalEntity.objects.create(
            name="ООО Длинное Название",
            short_name="ООО Короткое",
            inn="7743013902",
        )
        self.assertEqual(str(entity), "ООО Короткое")

        entity_no_short = LegalEntity.objects.create(
            name="ООО Только Длинное",
            inn="7707123456",
        )
        self.assertEqual(str(entity_no_short), "ООО Только Длинное")

    def test_inn_validation_length(self):
        """Test INN length validation"""
        # Valid 10-digit INN (for legal entities)
        entity = LegalEntity(
            name="Test",
            inn="7743013902",
        )
        entity.full_clean()  # Should not raise

        # Valid 12-digit INN (for individual entrepreneurs)
        entity = LegalEntity(
            name="Test",
            inn="773301234567",
        )
        entity.full_clean()  # Should not raise

        # Invalid length
        with self.assertRaises(ValidationError) as context:
            entity = LegalEntity(
                name="Test",
                inn="12345",  # Too short
            )
            entity.full_clean()
        self.assertIn("inn", context.exception.message_dict)

    def test_inn_validation_digits_only(self):
        """Test INN contains only digits"""
        with self.assertRaises(ValidationError) as context:
            entity = LegalEntity(
                name="Test",
                inn="774301390a",  # Contains letter
            )
            entity.full_clean()
        self.assertIn("inn", context.exception.message_dict)

    def test_inn_unique_constraint(self):
        """Test INN uniqueness"""
        LegalEntity.objects.create(
            name="First Company",
            inn="7743013902",
        )

        with self.assertRaises(ValidationError):
            entity = LegalEntity(
                name="Second Company",
                inn="7743013902",  # Duplicate INN
            )
            entity.full_clean()
            entity.save()

    def test_kpp_validation(self):
        """Test KPP validation"""
        # Valid KPP
        entity = LegalEntity(
            name="Test",
            inn="7743013902",
            kpp="774301001",
        )
        entity.full_clean()  # Should not raise

        # Invalid length
        with self.assertRaises(ValidationError) as context:
            entity = LegalEntity(
                name="Test",
                inn="7743013902",
                kpp="12345",  # Too short
            )
            entity.full_clean()
        self.assertIn("kpp", context.exception.message_dict)

    def test_bik_validation(self):
        """Test BIK validation"""
        # Valid BIK
        entity = LegalEntity(
            name="Test",
            inn="7743013902",
            bank_bik="044525225",
        )
        entity.full_clean()  # Should not raise

        # Invalid length
        with self.assertRaises(ValidationError) as context:
            entity = LegalEntity(
                name="Test",
                inn="7743013902",
                bank_bik="12345",  # Too short
            )
            entity.full_clean()
        self.assertIn("bank_bik", context.exception.message_dict)

        # Invalid characters
        with self.assertRaises(ValidationError) as context:
            entity = LegalEntity(
                name="Test",
                inn="7743013902",
                bank_bik="04452522a",  # Contains letter
            )
            entity.full_clean()
        self.assertIn("bank_bik", context.exception.message_dict)

    def test_bank_account_validation(self):
        """Test bank account validation"""
        # Valid account
        entity = LegalEntity(
            name="Test",
            inn="7743013902",
            bank_account="40702810938000012345",
        )
        entity.full_clean()  # Should not raise

        # Invalid length
        with self.assertRaises(ValidationError) as context:
            entity = LegalEntity(
                name="Test",
                inn="7743013902",
                bank_account="123456789",  # Too short
            )
            entity.full_clean()
        self.assertIn("bank_account", context.exception.message_dict)

        # Invalid characters
        with self.assertRaises(ValidationError) as context:
            entity = LegalEntity(
                name="Test",
                inn="7743013902",
                bank_account="4070281093800001234a",  # Contains letter
            )
            entity.full_clean()
        self.assertIn("bank_account", context.exception.message_dict)

    def test_status_choices(self):
        """Test status field choices"""
        entity = LegalEntity.objects.create(
            name="Test",
            inn="7743013902",
            status=LegalEntity.Status.ACTIVE,
        )
        self.assertEqual(entity.status, "active")
        self.assertTrue(entity.is_active)

        entity.status = LegalEntity.Status.PENDING
        self.assertFalse(entity.is_active)

        entity.status = LegalEntity.Status.SUSPENDED
        self.assertFalse(entity.is_active)

        entity.status = LegalEntity.Status.REJECTED
        self.assertFalse(entity.is_active)

    def test_empty_optional_fields(self):
        """Test that optional fields can be empty"""
        entity = LegalEntity.objects.create(
            name="Minimal Company",
            inn="7743013902",
            # All other fields are optional
        )
        entity.full_clean()
        entity.save()

        self.assertEqual(entity.kpp, "")
        self.assertEqual(entity.ogrn, "")
        self.assertEqual(entity.legal_address, "")
        self.assertEqual(entity.bank_name, "")
        self.assertEqual(entity.notes, "")
