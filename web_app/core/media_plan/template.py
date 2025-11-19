"""
Media plan template description used for Excel generation.

CHANGE: Introduce strongly-typed template definition for media plan export.
WHY: Issue #49 requires storing template structure inside repository/settings.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Tuple


@dataclass(frozen=True)
class MediaPlanColumn:
    """Single column definition inside the media plan sheet."""

    key: str
    title: str
    width: int = 20
    number_format: str | None = None


@dataclass(frozen=True)
class MediaPlanTemplate:
    """Container with sheet title and column configuration."""

    sheet_title: str
    columns: Tuple[MediaPlanColumn, ...]
    header_fill: str = "FF1F3A8C"
    header_font_color: str = "FFFFFFFF"
    header_alignment: str = "center"


MEDIA_PLAN_TEMPLATE = MediaPlanTemplate(
    sheet_title="TeleWin Media Plan",
    columns=(
        MediaPlanColumn("campaign_id", "ID кампании", width=20),
        MediaPlanColumn("campaign_name", "Название кампании", width=32),
        MediaPlanColumn("campaign_status", "Статус", width=18),
        MediaPlanColumn("campaign_format", "Формат", width=20),
        MediaPlanColumn("client", "Клиент", width=24),
        MediaPlanColumn("brand", "Бренд", width=20),
        MediaPlanColumn("budget", "Бюджет, ₽", width=18, number_format="#,##0.00"),
        MediaPlanColumn("start_date", "Дата старта", width=18, number_format="DD.MM.YYYY"),
        MediaPlanColumn("finish_date", "Дата завершения", width=20, number_format="DD.MM.YYYY"),
        MediaPlanColumn("slot_publication_at", "Публикация (фикс-слот)", width=25, number_format="DD.MM.YYYY HH:MM"),
        MediaPlanColumn("channels_count", "Каналов", width=12, number_format="0"),
        MediaPlanColumn("impressions_plan", "Показы (план)", width=18, number_format="#,##0"),
        MediaPlanColumn("impressions_fact", "Показы (факт)", width=18, number_format="#,##0"),
        MediaPlanColumn("clicks", "Клики", width=12, number_format="#,##0"),
        MediaPlanColumn("creative_title", "Название креатива", width=30),
    ),
)
