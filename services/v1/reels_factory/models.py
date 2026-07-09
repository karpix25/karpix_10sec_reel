"""Domain models for the Omni Reels factory skeleton."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Sequence


SUPPORTED_DURATIONS_SECONDS = (30, 40)
SEGMENT_DURATION_SECONDS = 10


@dataclass(frozen=True)
class ReelTiming:
    """Timing constraints for a reel generated in equal video chunks."""

    total_seconds: int
    segment_seconds: int = SEGMENT_DURATION_SECONDS

    @property
    def segment_count(self) -> int:
        return self.total_seconds // self.segment_seconds


@dataclass(frozen=True)
class ReelBrief:
    """User-approved creative input for a reel."""

    title: str
    topic: str
    audience: str
    language: str = "ru"
    tone: str = "бытовой, понятный, без канцелярита"
    product_name: str | None = None
    call_to_action: str | None = None
    constraints: tuple[str, ...] = field(default_factory=tuple)
    metadata: Mapping[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ReelSegment:
    """A single 10-second generation slot."""

    index: int
    starts_at_seconds: int
    duration_seconds: int
    role: str
    objective: str

    @property
    def ends_at_seconds(self) -> int:
        return self.starts_at_seconds + self.duration_seconds


@dataclass(frozen=True)
class ReelSegmentPlan:
    """Ordered segment plan for the whole reel."""

    timing: ReelTiming
    segments: tuple[ReelSegment, ...]

    def __post_init__(self) -> None:
        expected = self.timing.segment_count
        if len(self.segments) != expected:
            raise ValueError(f"Expected {expected} segments, got {len(self.segments)}")


@dataclass(frozen=True)
class SegmentPrompt:
    """Provider-neutral prompt draft for one segment."""

    segment: ReelSegment
    text: str
    negative_prompt: str | None = None
    reference_keys: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class SegmentAsset:
    """A local rendered segment ready for concat planning."""

    segment_index: int
    path: Path


def normalize_constraints(values: Sequence[str] | None) -> tuple[str, ...]:
    """Drop empty constraints while preserving order."""

    if not values:
        return ()
    return tuple(value.strip() for value in values if value and value.strip())
