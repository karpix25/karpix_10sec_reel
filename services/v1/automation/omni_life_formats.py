import hashlib
import re
from dataclasses import dataclass
from typing import Dict, Sequence, Tuple


GLOBAL_FORBIDDEN = (
    "зеркала и отражения",
    "молчаливое вступление",
    "съемка за рулем",
    "еда или питье во время речи",
    "открывание упаковки зубами",
    "рекламный показ этикетки в камеру",
    "крупный план продукта с возвратом к лицу",
)


@dataclass(frozen=True)
class LifeFormat:
    format_id: str
    provider_description: str
    keywords: Tuple[str, ...]
    setting: str
    opening_actions: Tuple[str, ...]
    development_actions: Tuple[str, ...]
    closing_actions: Tuple[str, ...]
    product_roles: Tuple[str, ...]
    quality_weight: int
    conflicts: Tuple[str, ...] = ()


LIFE_FORMATS: Tuple[LifeFormat, ...] = (
    LifeFormat(
        "habit_replacement",
        "герой заменяет неудобную старую привычку более простым бытовым действием",
        ("надоело", "неудоб", "порош", "банка", "замен", "брос", "заброс", "не могу"),
        "обычная домашняя зона со старым неудобным предметом на краю стола",
        ("сразу начинает реплику, касается старого предмета и отодвигает его",),
        ("наклоняется ближе к камере и продолжает мысль, освободив место на столе",),
        ("кладет один более удобный предмет на освободившееся место",),
        ("hidden", "natural_use", "brief_demo"),
        88,
        ("whats_in_my_bag",),
    ),
    LifeFormat(
        "moving_vlog",
        "живой разговор на ходу в безопасной бытовой локации",
        ("нашла", "поняла", "расскажу", "заметила", "проверила", "решила"),
        "спокойный коридор по пути наружу",
        ("уже медленно идет и начинает реплику в первом кадре",),
        ("слегка замедляется, переводит взгляд вперед и обратно",),
        ("останавливается и заканчивает мысль чуть ближе к камере",),
        ("hidden",),
        84,
        ("post_workout",),
    ),
    LifeFormat(
        "whats_in_my_bag",
        "герой разбирает открытую сумку как часть обычных сборов",
        ("сумк", "ношу", "таска", "с собой", "дорог", "поезд", "стик"),
        "прихожая или комната, открытая сумка лежит рядом с героем",
        ("начинает реплику и достает из сумки один неудобный предмет",),
        ("кладет этот предмет рядом, не перебирая остальные вещи",),
        ("достает один компактный предмет и оставляет его рядом с ключами",),
        ("hidden", "natural_use", "brief_demo"),
        81,
        ("habit_replacement",),
    ),
    LifeFormat(
        "post_workout",
        "разговор сразу после тренировки без упражнений в кадре",
        ("трен", "спорт", "зал", "сустав", "мышц", "восстанов", "нагруз"),
        "скамья после тренировки, спортивная сумка, полотенце и бутылка воды",
        ("сидит на скамье, снимает полотенце с плеча и сразу начинает реплику",),
        ("кладет один предмет в открытую спортивную сумку",),
        ("закрывает сумку и встает после окончания основной мысли",),
        ("hidden", "background_prop"),
        78,
        ("moving_vlog",),
    ),
    LifeFormat(
        "getting_ready",
        "герой собирается перед выходом, камера стоит сбоку; зеркал и отражений в кадре нет",
        ("кожа", "волос", "крем", "сыворот", "коллаген", "утро", "собира"),
        "комод, гардероб или прихожая во время спокойных сборов",
        ("начинает реплику и одним движением собирает волосы или отодвигает старый предмет",),
        ("кладет телефон и ключи в открытую сумку",),
        ("берет один компактный продукт и кладет его в сумку",),
        ("hidden", "natural_use", "background_prop"),
        74,
        ("morning_routine",),
    ),
    LifeFormat(
        "work_break",
        "короткий личный разговор во время рабочего перерыва",
        ("работ", "офис", "ноутбук", "задач", "курс", "учеб", "план"),
        "обычный рабочий стол с ноутбуком и одной кружкой",
        ("прикрывает ноутбук, поворачивается к камере и сразу начинает реплику",),
        ("отодвигает кружку и опирается одной рукой на стол",),
        ("берет сумку со спинки стула и встает",),
        ("hidden", "background_prop"),
        69,
        ("facetime_friend",),
    ),
    LifeFormat(
        "morning_routine",
        "утренняя домашняя рутина без постановочной демонстрации продукта",
        ("утро", "завтрак", "кофе", "кухн", "каждый день", "рутин"),
        "домашняя кухня со столом, готовой кружкой и ключами",
        ("начинает реплику и отодвигает один старый предмет",),
        ("берет готовую кружку и делает шаг к столу",),
        ("кладет один компактный продукт рядом с ключами",),
        ("hidden", "background_prop", "natural_use"),
        65,
        ("getting_ready",),
    ),
    LifeFormat(
        "facetime_friend",
        "близкий разговор с подругой, будто беседа уже началась",
        ("честно", "призн", "впервые", "не повер", "подруга", "расскажу"),
        "жилая комната, герой садится ближе к неподвижной телефонной камере",
        ("садится ближе к камере и сразу произносит конкретное признание",),
        ("ставит один предмет на стол и слегка наклоняется вперед",),
        ("заканчивает мысль с одним спокойным жестом свободной рукой",),
        ("hidden",),
        60,
        ("work_break",),
    ),
)


def select_life_format(script: str, recent_format_ids: Sequence[str] = ()) -> LifeFormat:
    normalized = script.lower().replace("ё", "е")
    first_phrase = re.split(r"[.!?]", normalized, maxsplit=1)[0]
    has_replacement_story = bool(re.search(r"вместо|замен|больше не|надоело|перестал|раньше.{0,40}теперь", normalized))
    recent = set(recent_format_ids[-5:])
    post_workout = life_format_by_id("post_workout")
    if any(keyword in first_phrase for keyword in post_workout.keywords):
        return post_workout
    scored = []
    for item in LIFE_FORMATS:
        if item.format_id == "habit_replacement" and not has_replacement_story:
            continue
        semantic_hits = sum(1 for keyword in item.keywords if keyword in normalized)
        opening_hits = sum(1 for keyword in item.keywords if keyword in first_phrase)
        semantic_score = min(semantic_hits, 4) * 100 + min(opening_hits, 2) * 160
        novelty_penalty = 180 if item.format_id in recent else 0
        conflict_penalty = 80 * sum(1 for conflict in item.conflicts if conflict in recent)
        score = semantic_score + item.quality_weight - novelty_penalty - conflict_penalty
        scored.append((score, _stable_tiebreak(script, item.format_id), item))
    if not scored or not any(any(keyword in normalized for keyword in item.keywords) for item in LIFE_FORMATS):
        return life_format_by_id("moving_vlog")
    return max(scored, key=lambda candidate: (candidate[0], candidate[1]))[2]


def life_format_by_id(format_id: str) -> LifeFormat:
    by_id: Dict[str, LifeFormat] = {item.format_id: item for item in LIFE_FORMATS}
    return by_id.get(format_id, LIFE_FORMATS[0])


def _stable_tiebreak(script: str, format_id: str) -> int:
    digest = hashlib.sha256(f"{script}:{format_id}".encode("utf-8")).hexdigest()
    return int(digest[:8], 16)
