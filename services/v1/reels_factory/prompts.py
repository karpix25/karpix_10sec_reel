"""Prompt builder stub for future Omni/KIE integrations."""

from __future__ import annotations

from .models import ReelBrief, ReelSegment, SegmentPrompt


DEFAULT_NEGATIVE_PROMPT = (
    "No fake medical guarantees, no unreadable text overlays, "
    "no abrupt scene reset between linked segments."
)


def build_segment_prompt(
    brief: ReelBrief,
    segment: ReelSegment,
    *,
    keep_last_frame_reference: bool = True,
) -> SegmentPrompt:
    """Build a provider-neutral draft prompt for a planned segment.

    This is a deterministic stub. Provider-specific adapters can later map the
    text and reference keys into KIE, HeyGen, or another video API payload.
    """

    references = ("previous_last_frame",) if keep_last_frame_reference and segment.index > 1 else ()
    product_line = f"Product: {brief.product_name}." if brief.product_name else "Product: not specified."
    cta_line = f"CTA: {brief.call_to_action}." if brief.call_to_action else "CTA: soft close only."
    constraints_line = "; ".join(brief.constraints) if brief.constraints else "No extra constraints."

    text = "\n".join(
        (
            f"Language: {brief.language}. Tone: {brief.tone}.",
            f"Reel: {brief.title}. Topic: {brief.topic}. Audience: {brief.audience}.",
            product_line,
            f"Segment {segment.index}: {segment.role}. Duration: {segment.duration_seconds}s.",
            f"Objective: {segment.objective}",
            cta_line,
            f"Constraints: {constraints_line}",
            "Keep visual continuity with the prior segment when a reference is provided.",
        )
    )
    return SegmentPrompt(
        segment=segment,
        text=text,
        negative_prompt=DEFAULT_NEGATIVE_PROMPT,
        reference_keys=references,
    )
