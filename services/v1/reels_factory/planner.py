"""Duration planning for 30/40 second reels."""

from __future__ import annotations

from .models import (
    SEGMENT_DURATION_SECONDS,
    SUPPORTED_DURATIONS_SECONDS,
    ReelSegment,
    ReelSegmentPlan,
    ReelTiming,
)


ROLE_PATTERNS = {
    3: (
        ("hook", "Open a sharp curiosity gap and establish the scene."),
        ("build", "Develop the core idea with one concrete proof point."),
        ("payoff", "Resolve the promise and move into a clear next action."),
    ),
    4: (
        ("hook", "Open a sharp curiosity gap and establish the scene."),
        ("context", "Frame the problem in plain language."),
        ("build", "Deliver the strongest proof point or demonstration."),
        ("payoff", "Resolve the promise and move into a clear next action."),
    ),
}


def plan_duration_segments(total_seconds: int) -> ReelSegmentPlan:
    """Split a supported reel duration into fixed 10-second segments."""

    if total_seconds not in SUPPORTED_DURATIONS_SECONDS:
        supported = ", ".join(str(value) for value in SUPPORTED_DURATIONS_SECONDS)
        raise ValueError(f"Unsupported duration {total_seconds}; expected one of {supported}")

    timing = ReelTiming(total_seconds=total_seconds)
    pattern = ROLE_PATTERNS[timing.segment_count]
    segments = tuple(
        ReelSegment(
            index=index + 1,
            starts_at_seconds=index * SEGMENT_DURATION_SECONDS,
            duration_seconds=SEGMENT_DURATION_SECONDS,
            role=role,
            objective=objective,
        )
        for index, (role, objective) in enumerate(pattern)
    )
    return ReelSegmentPlan(timing=timing, segments=segments)
