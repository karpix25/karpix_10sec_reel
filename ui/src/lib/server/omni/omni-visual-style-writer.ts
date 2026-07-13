import type {
  LifeFormatId,
  OmniLifeFormat,
  OmniLifeSceneArc,
  OmniVisualStylePlan,
  VisualStyleId,
} from "@/lib/omni/creative-contract";

type VisualStyleProfile = {
  id: VisualStyleId;
  label: string;
  keywords: readonly string[];
  audienceKeywords: readonly string[];
  formatBoosts: readonly LifeFormatId[];
  visualTone: string;
  cameraLanguage: string;
  lighting: string;
  sceneArc: OmniLifeSceneArc;
};

type WriteVisualStyleInput = {
  script: string;
  productName: string;
  productDescription?: string | null;
  targetAudience?: string | null;
  lifeFormat: OmniLifeFormat;
};

const FORBIDDEN_DEFAULTS = [
  "спокойный коридор как универсальная сцена",
  "связка ключей как обязательный реквизит",
  "одинаковая черная сумка во всех продуктах",
  "пустой проход к двери без связи со сценарием",
] as const;

const VISUAL_STYLE_PROFILES: readonly VisualStyleProfile[] = [
  {
    id: "talking_head_home",
    label: "говорящая голова у окна",
    keywords: ["почему", "важно", "нужно", "можно", "коллаген", "кожа", "уход", "совет", "ошибка", "секрет"],
    audienceKeywords: ["женщ", "девуш", "уход", "красот", "здоров", "занят"],
    formatBoosts: ["talking_head_cutaways", "facetime_friend", "work_break"],
    visualTone: "чистый UGC-разговор без постановочной хореографии, внимание на лице, интонации и доверии",
    cameraLanguage: "статичный телефон 9:16 на уровне глаз, основной кадр лицо и плечи, перебивки короткие и спокойные",
    lighting: "мягкий дневной свет из окна или ровный домашний свет, один и тот же тон кожи и одежды во всех частях",
    sceneArc: sceneArc("talking_head_window_cutaways", "у окна или у чистой домашней стены", [
      { name: "спокойный фон", appearance: "одна светлая домашняя стена или окно без читаемого текста и без лишних предметов", initialPosition: "позади героя весь ролик" },
      { name: "маленький столик", appearance: "одна чистая светлая поверхность без беспорядка", initialPosition: "сбоку от героя, используется только для коротких перебивок" },
    ], [
      "говорит в камеру крупным планом, плечи и лицо стабильны, руки почти не двигаются",
      "короткая перебивка на спокойный фон или чистую поверхность без действия руками",
      "возврат к лицу героя в той же одежде и с тем же светом",
      "говорит в камеру средним планом, делает только один небольшой жест ладонью",
      "короткая перебивка на деталь среды или продукт на столе, предметы неподвижны",
      "возврат к лицу героя, взгляд в камеру, речь продолжается спокойно",
      "говорит в камеру ближе к объективу, без смены локации",
      "короткая перебивка на продукт или нейтральную деталь без крупного рекламного плана",
      "финальный возврат к лицу героя, пауза только после последнего слова",
    ]),
  },
  {
    id: "beauty_daylight",
    label: "бьюти-стол у окна",
    keywords: ["коллаген", "кожа", "волос", "уход", "крем", "сыворот", "красот", "лицо"],
    audienceKeywords: ["женщ", "девуш", "бьюти", "уход", "красот"],
    formatBoosts: ["grwm", "morning_routine", "facetime_friend"],
    visualTone: "чистый дневной UGC без глянцевой рекламы, акцент на живой бытовой правде",
    cameraLanguage: "статичный телефон 9:16 на уровне груди, легкое движение рук в кадре, без зеркал",
    lighting: "мягкий боковой дневной свет из окна, натуральные тени, без студийной подсветки",
    sceneArc: sceneArc("beauty_daylight_table", "у светлого стола рядом с окном", [
      { name: "тканевый органайзер", appearance: "один светло-серый тканевый органайзер без логотипов", initialPosition: "стоит слева на столе" },
      { name: "телефон", appearance: "один черный телефон в матовом чехле", initialPosition: "лежит экраном вниз справа" },
      { name: "маленькое полотенце", appearance: "одно сложенное белое хлопковое полотенце", initialPosition: "лежит ближе к камере" },
    ], [
      "сдвигает тканевый органайзер ближе к себе", "вынимает маленькое полотенце", "кладет полотенце ровно перед собой",
      "поворачивает телефон экраном вниз и освобождает место", "показывает ладонью освободившуюся зону", "возвращает руку к органайзеру",
      "закрывает органайзер одним движением", "ставит телефон рядом с полотенцем", "завершает мысль у аккуратного стола",
    ]),
  },
  {
    id: "kitchen_counter",
    label: "кухонная стойка без еды в речи",
    keywords: ["утро", "рутин", "дом", "завтрак", "каждый день", "семь", "здоров"],
    audienceKeywords: ["дом", "мам", "семь", "здоров", "режим"],
    formatBoosts: ["morning_routine", "habit_replacement"],
    visualTone: "домашняя сцена с ощущением реального утра, без демонстрации употребления продукта",
    cameraLanguage: "телефон стоит на стойке, кадр держит руки и верх корпуса, без резких панорам",
    lighting: "ровный утренний свет с кухни, нейтральные цвета, без желтой ресторанной атмосферы",
    sceneArc: sceneArc("kitchen_counter_reset", "у кухонной стойки с небольшим бытовым порядком", [
      { name: "льняная салфетка", appearance: "одна светлая льняная салфетка без рисунка", initialPosition: "лежит развернутой по центру стойки" },
      { name: "закрытая бутылка воды", appearance: "одна прозрачная закрытая бутылка без этикетки", initialPosition: "стоит у дальнего края стойки" },
      { name: "заметка", appearance: "один маленький лист бумаги без читаемого текста", initialPosition: "лежит справа от салфетки" },
    ], [
      "складывает льняную салфетку пополам", "отодвигает закрытую бутылку к дальнему краю", "ставит заметку ближе к себе",
      "выравнивает салфетку по краю стойки", "показывает рукой небольшой порядок на поверхности", "убирает заметку под салфетку",
      "ставит бутылку рядом с салфеткой, не открывая ее", "освобождает руки от предметов", "завершает мысль у чистой стойки",
    ]),
  },
  {
    id: "worktable_focus",
    label: "рабочий стол с личной паузой",
    keywords: ["работ", "офис", "курс", "задач", "дедлайн", "устала", "ноутбук", "план"],
    audienceKeywords: ["работ", "предприним", "специалист", "занят", "офис"],
    formatBoosts: ["work_break", "habit_replacement"],
    visualTone: "собранный рабочий UGC, где продукт вписан в личную паузу, а не в рекламу",
    cameraLanguage: "телефон на столе чуть ниже лица, небольшая ручная поправка кадра допустима",
    lighting: "дневной офисный свет с мягкой настольной лампой, без холодного корпоративного вида",
    sceneArc: sceneArc("worktable_pause", "за рабочим столом во время короткой паузы", [
      { name: "ноутбук", appearance: "один темно-серый ноутбук без видимого логотипа", initialPosition: "приоткрыт по центру стола" },
      { name: "ручка", appearance: "одна тонкая черная ручка", initialPosition: "лежит справа от ноутбука" },
      { name: "лист задач", appearance: "один светлый лист без читаемого текста", initialPosition: "лежит ближе к камере" },
    ], [
      "прикрывает ноутбук одной рукой", "подвигает лист задач ближе", "кладет ручку поверх листа",
      "разворачивает стул чуть к камере", "убирает руку от ноутбука", "коротко показывает ладонью паузу в работе",
      "выравнивает лист задач по краю стола", "отодвигает ручку в сторону", "завершает мысль рядом с прикрытым ноутбуком",
    ]),
  },
  {
    id: "fitness_locker",
    label: "после тренировки без упражнений",
    keywords: ["спорт", "трен", "зал", "мышц", "восстанов", "нагруз", "фитнес", "бег"],
    audienceKeywords: ["спорт", "актив", "фитнес", "здоров"],
    formatBoosts: ["post_workout"],
    visualTone: "честный кадр после нагрузки, без постановочного фитнес-позирования",
    cameraLanguage: "телефон стоит на лавке, герой говорит спокойно, движения только с вещами",
    lighting: "мягкий свет раздевалки или домашней спортивной зоны, без неона и клубной картинки",
    sceneArc: sceneArc("fitness_packdown", "у лавки со спортивными вещами после тренировки", [
      { name: "спортивная сумка", appearance: "одна темно-серая спортивная сумка без логотипа", initialPosition: "открыта справа на лавке" },
      { name: "полотенце", appearance: "одно однотонное светло-серое полотенце", initialPosition: "лежит на лавке слева" },
    ], [
      "складывает полотенце один раз", "кладет полотенце рядом с открытой сумкой", "проверяет свободное место в сумке",
      "сдвигает сумку ближе к себе", "убирает ремень внутрь", "оставляет руки на краю лавки",
      "закрывает сумку одной рукой", "ставит сумку устойчиво рядом", "завершает мысль без дополнительных упражнений",
    ]),
  },
  {
    id: "sofa_confession",
    label: "домашний разговор без реквизитного шума",
    keywords: ["честно", "расскажу", "лично", "подруга", "совет", "поняла", "оказалось", "секрет"],
    audienceKeywords: ["подруг", "дом", "женщ", "личн"],
    formatBoosts: ["facetime_friend"],
    visualTone: "очень близкий разговор, будто зритель уже в диалоге",
    cameraLanguage: "неподвижный телефон на уровне глаз, герой чуть наклоняется к камере",
    lighting: "мягкий дневной свет из окна, фон спокойный и жилой",
    sceneArc: sceneArc("sofa_side_table", "на диване рядом с маленьким столиком", [
      { name: "плед", appearance: "один светло-серый плед без рисунка", initialPosition: "лежит сложенным на краю дивана" },
      { name: "телефон", appearance: "один черный телефон в матовом чехле", initialPosition: "лежит экраном вниз на столике" },
    ], [
      "садится ближе к неподвижной камере", "кладет телефон экраном вниз", "опирается одной рукой на край дивана",
      "чуть наклоняется вперед после смыслового поворота", "делает один открытый жест рукой", "возвращает руку на колено",
      "выравнивает плед на краю дивана", "останавливает движение рук", "завершает мысль спокойным взглядом в камеру",
    ]),
  },
  {
    id: "clean_product_table",
    label: "чистый стол под смысловой предмет",
    keywords: ["вместо", "замени", "надоело", "раньше", "теперь", "удоб", "прост"],
    audienceKeywords: ["практич", "эконом", "привыч", "занят"],
    formatBoosts: ["habit_replacement", "whats_in_my_bag"],
    visualTone: "минимальный бытовой кадр, где одно действие руками объясняет смысл",
    cameraLanguage: "телефон стоит на столе, кадр ниже лица и выше рук, без крупного product shot",
    lighting: "мягкий дневной свет, нейтральный фон, без студийной витрины",
    sceneArc: sceneArc("clean_table_swap", "у чистого домашнего стола с одним смысловым предметом", [
      { name: "старый предмет", appearance: "один нейтральный матовый предмет без логотипа, связанный с первой репликой", initialPosition: "лежит по центру стола" },
      { name: "тканевый чехол", appearance: "один серый тканевый чехол без надписей", initialPosition: "лежит справа от старого предмета" },
    ], [
      "касается старого предмета кончиками пальцев", "поворачивает его так, чтобы неудобство было понятно", "отодвигает его к левому краю",
      "раскрывает тканевый чехол", "показывает освободившееся место рукой", "кладет старый предмет рядом с чехлом",
      "закрывает чехол одним движением", "убирает старый предмет из центра кадра", "завершает мысль у свободной поверхности",
    ]),
  },
  {
    id: "city_window",
    label: "городской свет у окна",
    keywords: ["дорога", "город", "по пути", "поезд", "с собой", "актив", "день"],
    audienceKeywords: ["город", "актив", "молод", "путеше", "работ"],
    formatBoosts: ["moving_vlog", "whats_in_my_bag", "grwm"],
    visualTone: "ощущение движения через городской свет, но без коридора и прохода к двери",
    cameraLanguage: "телефон у окна, герой говорит стоя или сидя, движение создают руки и свет на фоне",
    lighting: "дневной городской свет через окно, мягкий фон без читаемых вывесок",
    sceneArc: sceneArc("city_window_pack", "у окна с городским светом на фоне", [
      { name: "тканевый шоппер", appearance: "один плотный серый тканевый шоппер без логотипа", initialPosition: "лежит открытым на стуле рядом" },
      { name: "транспортная карта", appearance: "одна нейтральная пластиковая карта без читаемого текста", initialPosition: "лежит на подоконнике" },
      { name: "телефон", appearance: "один черный телефон в матовом чехле", initialPosition: "лежит рядом с картой" },
    ], [
      "берет транспортную карту с подоконника", "кладет карту в шоппер", "проверяет свободное место рукой",
      "поворачивает телефон экраном вниз", "сдвигает шоппер ближе к себе", "оставляет руку на ремне шоппера",
      "закрывает шоппер одним движением", "ставит телефон рядом с шоппером", "завершает мысль на фоне дневного окна",
    ]),
  },
] as const;

export function writeOmniVisualStyle(input: WriteVisualStyleInput): OmniVisualStylePlan {
  const content = normalize([input.script, input.productName, input.productDescription].filter(Boolean).join(" "));
  const audience = normalize(input.targetAudience || "");
  const ranked = VISUAL_STYLE_PROFILES
    .map((profile) => ({ profile, score: scoreProfile(profile, input.lifeFormat.id, content, audience) }))
    .sort((left, right) => right.score - left.score || left.profile.id.localeCompare(right.profile.id));
  const bestScore = ranked[0]?.score ?? 0;
  const finalists = ranked.filter((candidate, index) => index < 3 && candidate.score >= bestScore - 1);
  const selected = finalists[stableHash(`${content}|${audience}|${input.lifeFormat.id}`) % finalists.length]?.profile ||
    ranked[0]?.profile ||
    VISUAL_STYLE_PROFILES[0];

  return {
    id: selected.id,
    label: selected.label,
    visualTone: selected.visualTone,
    cameraLanguage: selected.cameraLanguage,
    lighting: selected.lighting,
    sceneArc: selected.sceneArc,
    forbiddenDefaults: FORBIDDEN_DEFAULTS,
    selectionReason: `style=${selected.id}; score=${scoreProfile(selected, input.lifeFormat.id, content, audience)}`,
  };
}

function sceneArc(
  id: string,
  setting: string,
  fixedProps: OmniLifeSceneArc["fixedProps"],
  states: OmniLifeSceneArc["states"]
): OmniLifeSceneArc {
  return { id, setting, fixedProps, states };
}

function scoreProfile(profile: VisualStyleProfile, formatId: LifeFormatId, content: string, audience: string) {
  const contentHits = countHits(content, profile.keywords);
  const audienceHits = countHits(audience, profile.audienceKeywords);
  const formatFit = profile.formatBoosts.includes(formatId) ? 2.2 : 0;
  const semanticFit = Math.min(5, contentHits * 1.35 + audienceHits * 0.9);
  return round(semanticFit + formatFit);
}

function countHits(text: string, keywords: readonly string[]) {
  return keywords.reduce((count, keyword) => count + (text.includes(normalize(keyword)) ? 1 : 0), 0);
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
