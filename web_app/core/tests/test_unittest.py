import pytest

from .factories import ChannelAdminFactory


pytestmark = [
    pytest.mark.django_db
]


def test_create_channel_admin_with_user():
    channel_admin = ChannelAdminFactory.create()
    assert channel_admin.user is not None
