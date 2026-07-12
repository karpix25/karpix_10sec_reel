import re
from typing import List


MAX_WORDS_PER_PART = 18


def _clean_script(script: str) -> str:
    cleaned = script.replace("-", " ").replace("—", " ")
    cleaned = re.sub(r"\.{2,}", ".", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _split_into_voice_parts(script: str, max_words: int = MAX_WORDS_PER_PART) -> List[str]:
    words = script.split()
    return [" ".join(words[i : i + max_words]) for i in range(0, len(words), max_words)]


def _build_omni_part_prompt(
    *,
    part_text: str,
    part_number: int,
    total_parts: int,
    clothing: str = "",
) -> str:
    clothing_text = f" в {clothing}" if clothing else ""
    return (
        f"Вертикальное реалистичное UGC видео 9:16, часть {part_number} из {total_parts} "
        "одного непрерывного Reels. Один и тот же персонаж"
        f"{clothing_text} смотрит в камеру, говорит естественно на чистом русском языке. "
        "Сохраняй одинаковую внешность, одежду, свет, фон, темп речи и стиль съемки, "
        "чтобы все части склеились в единое видео. "
        f'В этой части нужно озвучить только этот точный текст: "{part_text}". '
        "Не добавляй другие фразы, не меняй порядок слов, не показывай субтитры. "
        "К концу сцены камера делает мягкий плавный наезд."
    )


def process_scenario_for_omni(script: str, clothing: str = "") -> List[str]:
    cleaned = _clean_script(script)
    parts = _split_into_voice_parts(cleaned)
    total_parts = len(parts)

    return [
        _build_omni_part_prompt(
            part_text=part_text,
            part_number=index + 1,
            total_parts=total_parts,
            clothing=clothing,
        )
        for index, part_text in enumerate(parts)
    ]
