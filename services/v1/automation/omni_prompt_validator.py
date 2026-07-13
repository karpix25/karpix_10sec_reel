import re
from dataclasses import dataclass
from typing import Sequence, Tuple


FORBIDDEN_ACTION_PATTERNS = (
    re.compile(r"(?:у|через|перед)\s+зеркал", re.IGNORECASE),
    re.compile(r"(?:видно|появляется|говорит)\s+(?:в|через)\s+отражен", re.IGNORECASE),
    re.compile(r"открыва(?:ет|я)\s+.*зуб", re.IGNORECASE),
    re.compile(r"(?:ведет|управляет)\s+автомобил", re.IGNORECASE),
    re.compile(r"закрывает\s+(?:объектив|камеру)\s+(?:рукой|ладонью)", re.IGNORECASE),
    re.compile(r"крупный\s+план\s+продукта.*(?:возвращ|обратно).*лиц", re.IGNORECASE),
)

CONSUMPTION_DURING_SPEECH = re.compile(
    r"(?:ест|жует|кусает|пьет|глотает|наносит\s+на\s+(?:лицо|губы)).*(?:говорит|продолжает\s+речь)",
    re.IGNORECASE,
)
LONG_DASH_OR_EMOJI = re.compile(
    "[\u2012\u2013\u2014\u2015\u2212\ufe0f\u20e3"
    "\U0001F1E6-\U0001F1FF\U0001F300-\U0001FAFF\u2300-\u23FF\u2600-\u27BF]"
)
PROVIDER_PLATFORM_IMPRINT_PATTERNS = (
    re.compile(r"\b(?:reels?|instagram|tiktok|youtube\s*shorts|shorts)\b", re.IGNORECASE),
    re.compile(
        r"(?:инстаграм(?:а|е|ом)?|инста(?:грам)?|рилс(?:а|ы|е|ом|ов)?|"
        r"тикток(?:а|е|ом)?|ютуб\s*шортс(?:а|ов|е)?|шортс(?:а|ов|е)?)",
        re.IGNORECASE,
    ),
)


@dataclass(frozen=True)
class PromptValidationResult:
    valid: bool
    score: int
    errors: Tuple[str, ...]
    warnings: Tuple[str, ...]


def validate_omni_prompt(
    *,
    prompt: str,
    exact_voiceover: str,
    beat_actions: Sequence[str],
    product_role: str,
    continuity_props: Sequence[str] = (),
) -> PromptValidationResult:
    errors = []
    warnings = []
    joined_actions = " ".join(beat_actions)

    if "0.0 секунде" not in prompt:
        errors.append("speech_must_start_at_zero")
    if prompt.count(f'"{exact_voiceover}"') != 1:
        errors.append("exact_voiceover_must_appear_once")
    if LONG_DASH_OR_EMOJI.search(exact_voiceover):
        errors.append("voiceover_contains_long_dash_or_emoji")
    if continuity_props and "ПАСПОРТ РЕКВИЗИТА ДЛЯ ВСЕХ ЧАСТЕЙ:" not in prompt:
        errors.append("continuity_prop_passport_required")
    if any(prop not in prompt for prop in continuity_props):
        errors.append("continuity_prop_details_missing")
    instruction_surface = prompt.replace(f'ТОЧНАЯ РЕПЛИКА: "{exact_voiceover}"', 'ТОЧНАЯ РЕПЛИКА: ""')
    if any(pattern.search(instruction_surface) for pattern in PROVIDER_PLATFORM_IMPRINT_PATTERNS):
        errors.append("provider_prompt_contains_platform_imprint")
    if len(beat_actions) != 3 or any(not action.strip() for action in beat_actions):
        errors.append("three_complete_beats_required")
    if any(pattern.search(joined_actions) for pattern in FORBIDDEN_ACTION_PATTERNS):
        errors.append("forbidden_visual_motif")
    if CONSUMPTION_DURING_SPEECH.search(joined_actions):
        errors.append("consumption_during_speech")
    if product_role != "brief_demo" and re.search(r"(?:этикетк|логотип).*(?:камер|центр)", joined_actions, re.IGNORECASE):
        errors.append("advertising_product_display")

    first_words = exact_voiceover.split()[:15]
    if len(exact_voiceover.split()) > 24:
        warnings.append("voiceover_may_be_too_long_for_ten_seconds")
    if len(first_words) == 15 and not re.search(r"[.!?]", " ".join(first_words)):
        warnings.append("spoken_hook_may_exceed_four_seconds")
    if len(set(action.lower() for action in beat_actions)) != len(beat_actions):
        warnings.append("repeated_beat_action")

    score = max(0, 100 - (25 * len(errors)) - (6 * len(warnings)))
    return PromptValidationResult(not errors, score, tuple(errors), tuple(warnings))
