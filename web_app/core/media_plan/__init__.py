"""
Utilities responsible for describing and generating media plan files.

CHANGE: Introduce dedicated package for media-plan template/configuration.
WHY: Issues #49-50 require deterministic Excel template and generator service.
"""
from .template import MEDIA_PLAN_TEMPLATE, MediaPlanTemplate, MediaPlanColumn
from .generator import (
    MediaPlanGenerator,
    MediaPlanGenerationError,
    MediaPlanGenerationResult,
)

__all__ = [
    "MEDIA_PLAN_TEMPLATE",
    "MediaPlanTemplate",
    "MediaPlanColumn",
    "MediaPlanGenerator",
    "MediaPlanGenerationError",
    "MediaPlanGenerationResult",
]
