from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import MessagePreviewToken
from core.tests.factories import MessageFactory, UserFactory


class MessagePreviewAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.message = MessageFactory()
        self.url_preview = f"/api/message/{self.message.id}/preview/"
        self.url_resolve = "/api/message/preview/resolve/"

    def test_preview_requires_auth(self):
        response = self.client.post(self.url_preview, format="json")
        self.assertIn(response.status_code, (401, 403))

    def test_preview_requires_permission(self):
        user = UserFactory(is_staff=False, is_superuser=False)
        self.client.force_authenticate(user=user)

        response = self.client.post(self.url_preview, format="json")

        self.assertEqual(response.status_code, 403)

    def test_preview_creates_token_and_returns_link(self):
        user = UserFactory(is_staff=True, is_superuser=True)
        self.client.force_authenticate(user=user)

        response = self.client.post(self.url_preview, format="json")

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertIn("token", body)
        self.assertIn("deep_link", body)
        self.assertTrue(
            MessagePreviewToken.objects.filter(token=body["token"]).exists()
        )
        saved_token = MessagePreviewToken.objects.get(token=body["token"])
        # TTL около 30 минут
        ttl = saved_token.expires_at - timezone.now()
        self.assertGreaterEqual(ttl.total_seconds(), 25 * 60)
        self.assertLessEqual(ttl.total_seconds(), 35 * 60)

    def test_resolve_consumes_token(self):
        token = MessagePreviewToken.objects.create(
            token="test-token",
            message=self.message,
            expires_at=timezone.now() + timedelta(minutes=5),
        )

        response = self.client.post(self.url_resolve, {"token": token.token}, format="json")

        self.assertEqual(response.status_code, 200)
        token.refresh_from_db()
        self.assertIsNotNone(token.used_at)

    def test_resolve_not_found(self):
        response = self.client.post(self.url_resolve, {"token": "unknown-token"}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_resolve_reuse_returns_gone(self):
        token = MessagePreviewToken.objects.create(
            token="reuse-token",
            message=self.message,
            expires_at=timezone.now() + timedelta(minutes=5),
            used_at=timezone.now(),
        )

        response = self.client.post(self.url_resolve, {"token": token.token}, format="json")

        self.assertEqual(response.status_code, 410)

    def test_resolve_expired_token(self):
        token = MessagePreviewToken.objects.create(
            token="expired-token",
            message=self.message,
            expires_at=timezone.now() - timedelta(minutes=1),
        )

        response = self.client.post(self.url_resolve, {"token": token.token}, format="json")

        self.assertEqual(response.status_code, 410)
