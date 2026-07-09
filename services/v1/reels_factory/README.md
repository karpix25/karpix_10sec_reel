# Omni Reels Factory Skeleton

This package is a side-effect-free skeleton for a future Omni Reels generation
factory. It does not call external providers, touch the database, run FFmpeg, or
modify Telegram/UI flows.

## What It Owns

- `models.py`: small dataclasses for briefs, timing, segments, prompts, and
  local segment assets.
- `planner.py`: fixed 30/40 second duration planning into 10-second segments.
- `prompts.py`: deterministic provider-neutral prompt stub per segment.
- `concat.py`: FFmpeg concat manifest text and command argument builders.
- `factory.py`: high-level assembly of timing plus prompts.

## Integration Notes

Future integration should happen from existing orchestration/worker layers, not
from this package directly. A caller can:

1. Build a `ReelBrief`.
2. Call `build_reels_plan(brief, total_seconds=30)` or `40`.
3. Send each `SegmentPrompt` to the selected provider adapter.
4. Persist generated segment file paths outside this package.
5. Use `build_concat_manifest(paths)` and `build_concat_command(...)` to prepare
   a final concat step.

The concat helpers intentionally return strings and argv tuples only. The worker
that owns subprocess execution should write the manifest and run FFmpeg.
