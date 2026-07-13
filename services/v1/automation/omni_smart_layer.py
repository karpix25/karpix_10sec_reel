import math
from typing import List, Tuple

from services.v1.automation.omni_life_formats import GLOBAL_FORBIDDEN, LifeFormat, select_life_format
from services.v1.automation.omni_prompt_validator import validate_omni_prompt
from services.v1.automation.omni_script_segmentation import normalize_script_text, split_script_into_voice_parts


TARGET_WORDS_PER_PART = 18

FORMAT_STATE_ARCS = {
    "habit_replacement": (
        "касается старого способа, прямо названного в реплике", "поворачивает его так, чтобы неудобство было видно", "отодвигает его к краю стола",
        "освобождает место перед собой", "убирает старый способ в сторону", "возвращает пустую руку в кадр",
        "показывает освободившееся место ладонью", "убирает старый способ из кадра", "остается у чистого стола с пустыми руками",
    ),
    "moving_vlog": (
        "уже идет спокойным шагом по коридору", "слегка замедляет шаг", "проходит заметную дверь на фоне",
        "поворачивает за угол", "подносит телефон немного ближе", "снова выравнивает шаг",
        "подходит к выходу", "останавливается перед дверью", "завершает мысль лицом к камере с пустыми руками",
    ),
    "whats_in_my_bag": (
        "открывает повседневную сумку", "достает связку ключей", "кладет ключи рядом с сумкой",
        "проверяет боковой карман", "кладет ключи в боковой карман", "придвигает сумку к себе",
        "поправляет ремень сумки", "закрывает сумку", "убирает руки с сумки и смотрит в камеру",
    ),
    "post_workout": (
        "снимает полотенце с плеча", "складывает полотенце один раз", "кладет полотенце в спортивную сумку",
        "придвигает сумку к себе", "убирает ремень внутрь", "проверяет молнию одной рукой",
        "закрывает сумку", "встает со скамьи", "ставит сумку рядом и завершает мысль ближе к камере",
    ),
    "getting_ready": (
        "открывает повседневную сумку на комоде", "кладет в нее ключи", "сдвигает сумку ближе к краю",
        "берет сложенный шарф с комода", "кладет шарф в сумку", "проверяет свободное место одной рукой",
        "закрывает сумку", "надевает ремень сумки на плечо", "останавливается у выхода с пустыми руками",
    ),
    "work_break": (
        "прикрывает ноутбук одной рукой", "отодвигается от стола", "поворачивает стул к камере",
        "кладет ручку рядом с ноутбуком", "убирает блокнот в сторону", "ставит обе руки на край стола",
        "встает из-за стола", "задвигает стул", "останавливается рядом со столом лицом к камере",
    ),
    "morning_routine": (
        "кладет ключи рядом с открытой сумкой", "сдвигает готовую кружку в сторону", "освобождает место перед собой",
        "складывает салфетку", "кладет салфетку рядом с кружкой", "придвигает сумку к себе",
        "кладет ключи в сумку", "закрывает сумку", "остается у стола с пустыми руками ближе к камере",
    ),
    "facetime_friend": (
        "садится ближе к неподвижной камере", "кладет телефон экраном вниз рядом", "опирается локтем на колено",
        "выпрямляется после смыслового поворота", "делает один открытый жест рукой", "убирает руку на колено",
        "наклоняется чуть ближе", "кивает один раз", "заканчивает мысль спокойным взглядом в камеру",
    ),
}


def process_scenario_for_omni(script: str, clothing: str = "") -> List[str]:
    cleaned = normalize_script_text(script)
    if not cleaned:
        return []

    part_count = max(1, math.ceil(len(cleaned.split()) / TARGET_WORDS_PER_PART))
    voice_parts = split_script_into_voice_parts(cleaned, part_count)
    life_format = select_life_format(cleaned)
    product_role = "hidden"

    return [
        _build_omni_part_prompt(
            part_text=part_text,
            part_number=index + 1,
            total_parts=len(voice_parts),
            clothing=clothing,
            life_format=life_format,
            product_role=product_role,
        )
        for index, part_text in enumerate(voice_parts)
    ]


def _build_omni_part_prompt(
    *,
    part_text: str,
    part_number: int,
    total_parts: int,
    clothing: str,
    life_format: LifeFormat,
    product_role: str,
) -> str:
    beats = _build_segment_beats(life_format, part_number, total_parts, product_role)
    clothing_text = f" в {clothing}" if clothing else ""
    prompt = "\n".join(
        (
            f"Вертикальное реалистичное UGC-видео 9:16, часть {part_number} из {total_parts} одного непрерывного Reels.",
            f"ЖИЗНЕННАЯ СИТУАЦИЯ: {life_format.provider_description}. Локация: {life_format.setting}.",
            f"ПЕРСОНАЖ: один и тот же человек{clothing_text}; одинаковые внешность, одежда, свет, фон и темп речи.",
            "СТАРТ РЕЧИ: первое слово точной реплики звучит в первом кадре на 0.0 секунде одновременно с уже начавшимся физическим действием. До первого слова нет паузы, улыбки, вдоха, приветствия или подготовительного движения.",
            f'ТОЧНАЯ РЕПЛИКА: "{part_text}"',
            "ТРИ СОСТОЯНИЯ ОДНОГО ДЕЙСТВИЯ:",
            f"0.0-3.0 сек: {beats[0]}.",
            f"3.0-7.0 сек: {beats[1]}.",
            f"7.0-10.0 сек: {beats[2]}.",
            "РЕЧЬ И ДЕЙСТВИЕ: реплика продолжается естественно между тремя состояниями; не добавлять и не повторять слова, не показывать субтитры.",
            "РОЛЬ ПРОДУКТА: продукт и упаковку в этой части не показывать; интерес держится на личной истории.",
            "НЕПРЕРЫВНОСТЬ: один телефонный кадр без перебивок и рекламных крупных планов; следующая часть продолжает ту же бытовую ситуацию.",
            f"ЗАПРЕЩЕНО: {'; '.join(GLOBAL_FORBIDDEN)}.",
        )
    )
    validation = validate_omni_prompt(
        prompt=prompt,
        exact_voiceover=part_text,
        beat_actions=beats,
        product_role=product_role,
    )
    if not validation.valid:
        raise ValueError(f"Invalid Omni life-format prompt: {', '.join(validation.errors)}")
    return prompt


def _build_segment_beats(
    life_format: LifeFormat,
    part_number: int,
    total_parts: int,
    product_role: str,
) -> Tuple[str, str, str]:
    states = FORMAT_STATE_ARCS[life_format.format_id]
    if total_parts <= 3:
        start = (part_number - 1) * 3
        opening, development, closing = states[start:start + 3]
    else:
        first = round(((part_number - 1) * 8) / total_parts)
        last = round((part_number * 8) / total_parts)
        middle = round((first + last) / 2)
        opening, development, closing = states[first], states[middle], states[last]

    if part_number > 1:
        opening = f"без сброса сцены продолжает из предыдущего положения и {opening}"

    if part_number < total_parts:
        closing = f"{closing}; остается в этом положении для следующей части"
    else:
        closing = f"{closing}; завершает точную реплику без дополнительного CTA"
    return opening, development, closing
