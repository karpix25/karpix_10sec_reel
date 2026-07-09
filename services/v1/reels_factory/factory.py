"""High-level assembly helpers for the Omni Reels factory skeleton."""

from __future__ import annotations

from dataclasses import dataclass

from .models import ReelBrief, ReelSegmentPlan, SegmentPrompt
from .planner import plan_duration_segments
from .prompts import build_segment_prompt


@dataclass(frozen=True)
class ReelsFactoryPlan:
    """A deterministic plan that can later be handed to provider workers."""

    brief: ReelBrief
    segment_plan: ReelSegmentPlan
    prompts: tuple[SegmentPrompt, ...]


def build_reels_plan(brief: ReelBrief, total_seconds: int) -> ReelsFactoryPlan:
    """Create segment timing and provider-neutral prompts for a reel."""

    segment_plan = plan_duration_segments(total_seconds)
    prompts = tuple(build_segment_prompt(brief, segment) for segment in segment_plan.segments)
    return ReelsFactoryPlan(brief=brief, segment_plan=segment_plan, prompts=prompts)
