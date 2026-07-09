"""Minimal Omni Reels factory primitives.

This package is intentionally side-effect free: it builds plans, prompts, and
FFmpeg command arguments, but does not call video providers or run subprocesses.
"""

from .concat import (
    ConcatCommand,
    build_concat_command,
    build_concat_manifest,
    ordered_asset_paths,
)
from .factory import ReelsFactoryPlan, build_reels_plan
from .models import (
    ReelBrief,
    ReelSegment,
    ReelSegmentPlan,
    ReelTiming,
    SegmentAsset,
    SegmentPrompt,
    normalize_constraints,
)
from .planner import plan_duration_segments
from .prompts import build_segment_prompt

__all__ = [
    "ConcatCommand",
    "ReelBrief",
    "ReelSegment",
    "ReelSegmentPlan",
    "ReelTiming",
    "ReelsFactoryPlan",
    "SegmentAsset",
    "SegmentPrompt",
    "build_concat_command",
    "build_concat_manifest",
    "build_reels_plan",
    "build_segment_prompt",
    "normalize_constraints",
    "ordered_asset_paths",
    "plan_duration_segments",
]
