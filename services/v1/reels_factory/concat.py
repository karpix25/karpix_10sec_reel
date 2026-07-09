"""FFmpeg concat-list helpers.

The helpers return data and argv only; callers decide where to write files and
whether to execute FFmpeg.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from .models import SegmentAsset


@dataclass(frozen=True)
class ConcatCommand:
    """A prepared FFmpeg concat invocation."""

    manifest_path: Path
    output_path: Path
    argv: tuple[str, ...]


def build_concat_manifest(segment_paths: Sequence[str | Path]) -> str:
    """Build the text expected by FFmpeg's concat demuxer."""

    if not segment_paths:
        raise ValueError("At least one segment path is required")

    return "\n".join(f"file '{_escape_concat_path(Path(path))}'" for path in segment_paths) + "\n"


def build_concat_command(
    manifest_path: str | Path,
    output_path: str | Path,
    *,
    ffmpeg_bin: str = "ffmpeg",
    reencode: bool = False,
) -> ConcatCommand:
    """Build argv for an FFmpeg concat-demuxer command."""

    manifest = Path(manifest_path)
    output = Path(output_path)
    codec_args = ("-c:v", "libx264", "-c:a", "aac") if reencode else ("-c", "copy")
    argv = (
        ffmpeg_bin,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(manifest),
        *codec_args,
        str(output),
    )
    return ConcatCommand(manifest_path=manifest, output_path=output, argv=argv)


def ordered_asset_paths(assets: Sequence[SegmentAsset]) -> tuple[Path, ...]:
    """Return local segment paths ordered by planned segment index."""

    return tuple(asset.path for asset in sorted(assets, key=lambda item: item.segment_index))


def _escape_concat_path(path: Path) -> str:
    return str(path).replace("'", r"'\''")
