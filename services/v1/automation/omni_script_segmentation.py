import re
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Sequence, Set, Tuple


BAD_ENDINGS = {
    "а", "без", "в", "для", "до", "за", "и", "из", "или", "к", "как", "на", "но",
    "о", "об", "от", "по", "под", "при", "про", "с", "со", "у", "что", "чтобы",
}

PROTECTED_PHRASES = (
    re.compile(r"артикул(?:\s+\S+){0,5}\s+(?:в|под)\s+(?:описании|видео)", re.IGNORECASE),
    re.compile(r"код(?:\s+\S+){0,5}\s+(?:в|под)\s+(?:описании|видео)", re.IGNORECASE),
    re.compile(r"(?:напиши|напишите|оставь|оставьте)(?:\s+\S+){0,4}\s+в\s+комментариях", re.IGNORECASE),
    re.compile(r"кодовое\s+слово\s+[«\"]?\S+[»\"]?", re.IGNORECASE),
)

LONG_DASH_RE = re.compile(r"[\u2012\u2013\u2014\u2015\u2212]")
EMOJI_RE = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"
    "\U0001F300-\U0001FAFF"
    "\u2300-\u23FF"
    "\u2600-\u27BF"
    "]",
    flags=re.UNICODE,
)


@dataclass(frozen=True)
class Token:
    value: str
    start: int
    end: int


def normalize_script_text(script: str) -> str:
    cleaned = LONG_DASH_RE.sub(", ", script).replace("-", " ")
    cleaned = EMOJI_RE.sub("", cleaned).replace("\ufe0f", "").replace("\u20e3", "")
    cleaned = re.sub(r"\.{2,}", ".", cleaned)
    cleaned = re.sub(r"\s+([,.!?;:])", r"\1", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def split_script_into_voice_parts(script: str, part_count: int) -> List[str]:
    normalized = normalize_script_text(script)
    if not normalized or part_count <= 0:
        return []

    tokens = _tokenize(normalized)
    count = min(part_count, len(tokens))
    protected = _protected_boundaries(normalized, tokens)
    boundaries = _best_boundaries(tokens, count, protected)
    return [
        " ".join(token.value for token in tokens[start:end])
        for start, end in zip(boundaries, boundaries[1:])
    ]


def reconstruct_voice_parts(parts: Sequence[str]) -> str:
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def _tokenize(text: str) -> List[Token]:
    return [Token(match.group(0), match.start(), match.end()) for match in re.finditer(r"\S+", text)]


def _protected_boundaries(text: str, tokens: Sequence[Token]) -> Set[int]:
    protected: Set[int] = set()
    for pattern in PROTECTED_PHRASES:
        for match in pattern.finditer(text):
            for boundary in range(1, len(tokens)):
                if match.start() < tokens[boundary].start < match.end():
                    protected.add(boundary)
    return protected


def _best_boundaries(tokens: Sequence[Token], count: int, protected: Set[int]) -> List[int]:
    if count <= 1:
        return [0, len(tokens)]
    target = len(tokens) / count

    @lru_cache(maxsize=None)
    def solve(start: int, remaining: int) -> Tuple[float, Tuple[int, ...]] | None:
        if remaining == 1:
            if start >= len(tokens):
                return None
            return _segment_penalty(start, len(tokens), target), (len(tokens),)

        best: Tuple[float, Tuple[int, ...]] | None = None
        max_end = len(tokens) - (remaining - 1)
        for end in range(start + 1, max_end + 1):
            if end in protected:
                continue
            tail = solve(end, remaining - 1)
            if tail is None:
                continue
            score = _segment_penalty(start, end, target) + _boundary_penalty(tokens[end - 1].value) + tail[0]
            if best is None or score < best[0]:
                best = score, (end, *tail[1])
        return best

    result = solve(0, count)
    if result is None:
        fallback = [round((index * len(tokens)) / count) for index in range(count + 1)]
        return fallback
    return [0, *result[1]]


def _segment_penalty(start: int, end: int, target: float) -> float:
    length = end - start
    tiny = max(0, 4 - length) * 80
    too_long = max(0, length - 28) * 12
    return ((length - target) ** 2) + tiny + too_long


def _boundary_penalty(value: str) -> int:
    normalized = re.sub(r"[^\w]+", "", value.lower(), flags=re.UNICODE)
    if normalized in BAD_ENDINGS:
        return 120
    if re.search(r"[.!?][»\"]?$", value):
        return -20
    if re.search(r"[,;:][»\"]?$", value):
        return -7
    return 0
