import {
  OMNI_ACTION_SAFETY_RULES,
  OMNI_FORBIDDEN_MOTIFS,
  type LifeFormatId,
  type OmniContinuityProp,
  type OmniLifeFormat,
  type OmniLifeSceneArc,
} from "@/lib/omni/creative-contract";

const shared = { forbiddenMotifs: OMNI_FORBIDDEN_MOTIFS, safetyRules: OMNI_ACTION_SAFETY_RULES } as const;

function arc(
  id: string,
  setting: string,
  fixedProps: readonly OmniContinuityProp[],
  states: OmniLifeSceneArc["states"]
): OmniLifeSceneArc {
  return { id, setting, fixedProps, states };
}

export const OMNI_LIFE_FORMATS: readonly OmniLifeFormat[] = [
  {
    ...shared,
    id: "talking_head_cutaways",
    uiLabel: "Говорящая голова с перебивками",
    providerDescription: "живая говорящая голова с простыми монтажными перебивками по смыслу реплики",
    retentionPriority: 96,
    semanticKeywords: ["почему", "важно", "нужно", "можно", "разбер", "расскажу", "знаете", "ошибка", "секрет", "совет"],
    audienceKeywords: ["женщ", "девуш", "занят", "работ", "дом", "здоров", "уход", "красот", "бьюти"],
    sceneArcs: [arc("talking_head_home_cutaways", "у окна или у обычной домашней стены", [
      { name: "жилой фон", appearance: "одна светлая домашняя стена или окно без читаемого текста, с небольшими естественными неровностями комнаты", initialPosition: "позади героя на протяжении всех частей" },
      { name: "боковая поверхность", appearance: "одна светлая бытовая поверхность с естественными тенями и мелкими следами использования", initialPosition: "сбоку от героя, попадает в перебивки только при необходимости" },
    ], [
      "говорит в камеру крупным планом, плечи и лицо держатся естественно, руки почти не двигаются",
      "короткая перебивка на жилой фон или боковую поверхность без постановочного действия руками",
      "возврат к лицу героя в той же одежде и с тем же светом",
      "говорит в камеру средним планом, делает только один небольшой жест ладонью",
      "короткая перебивка на деталь среды или продукт на столе, предметы физически стоят на поверхности",
      "возврат к лицу героя, взгляд в камеру, речь продолжается спокойно",
      "говорит в камеру ближе к объективу, без смены локации",
      "короткая перебивка на продукт или нейтральную деталь без крупного рекламного плана",
      "финальный возврат к лицу героя, пауза только после последнего слова",
    ])],
    allowedProductRoles: ["hidden", "background_prop", "brief_demo"],
    preferredProductRoles: ["background_prop", "hidden", "brief_demo"],
    compatibleHooks: ["result_first", "problem_in_action", "contrast", "broken_expectation"],
    actionComplexity: "low",
    adjacentFormats: ["facetime_friend", "work_break"],
  },
  {
    ...shared,
    id: "grwm",
    uiLabel: "GRWM без зеркала",
    providerDescription: "живые сборы перед выходом, снятые боковой камерой без зеркал",
    retentionPriority: 74,
    semanticKeywords: ["собираюсь", "сборы", "одежда", "укладка", "кожа", "волос", "крем", "уход", "выхожу"],
    audienceKeywords: ["девуш", "женщ", "бьюти", "красот", "стиль", "уход"],
    sceneArcs: [arc("dresser_bag", "у комода перед выходом", [
      { name: "повседневная сумка", appearance: "матовая черная нейлоновая сумка среднего размера с черным ремнем", initialPosition: "открыта на правой стороне комода" },
      { name: "ключи", appearance: "одна связка из двух серебристых ключей на черном кольце", initialPosition: "лежит слева от сумки" },
      { name: "сложенная вещь", appearance: "один сложенный темно-серый шарф без рисунка", initialPosition: "лежит за ключами" },
    ], [
      "открывает повседневную сумку на комоде", "кладет в нее ключи", "сдвигает сумку ближе к краю",
      "берет сложенную вещь с комода", "кладет эту вещь в сумку", "проверяет свободное место одной рукой",
      "закрывает сумку", "надевает ремень сумки на плечо", "останавливается у выхода с пустыми руками",
    ])],
    allowedProductRoles: ["hidden", "natural_use", "background_prop", "brief_demo"],
    preferredProductRoles: ["natural_use", "hidden", "brief_demo", "background_prop"],
    compatibleHooks: ["problem_in_action", "result_first", "contrast", "broken_expectation"],
    actionComplexity: "low", adjacentFormats: ["morning_routine"],
  },
  {
    ...shared,
    id: "moving_vlog",
    uiLabel: "Влог в движении",
    providerDescription: "живой разговор на спокойной прогулке или в коридоре",
    retentionPriority: 84,
    semanticKeywords: ["иду", "шла", "дорога", "прогул", "по пути", "лифт", "недавно", "нашла"],
    audienceKeywords: ["занят", "город", "актив", "молод", "путеше", "работ"],
    sceneArcs: [arc("safe_walk", "в спокойном коридоре по пути наружу", [
      { name: "дверь", appearance: "одна матовая темно-серая дверь с серебристой ручкой", initialPosition: "в конце коридора по центру фона" },
      { name: "настенный ориентир", appearance: "одна небольшая белая прямоугольная табличка без текста", initialPosition: "на правой стене коридора" },
    ], [
      "уже идет спокойным шагом к камере", "слегка замедляет шаг", "проходит понятный ориентир на стене",
      "поворачивает за угол без остановки речи", "переводит телефон чуть ближе к лицу", "снова выравнивает шаг",
      "подходит к двери", "останавливается перед дверью", "завершает мысль лицом к камере с пустыми руками",
    ])],
    allowedProductRoles: ["hidden", "natural_use"], preferredProductRoles: ["hidden", "natural_use"],
    compatibleHooks: ["problem_in_action", "result_first", "broken_expectation"],
    actionComplexity: "medium", adjacentFormats: ["post_workout"],
  },
  {
    ...shared,
    id: "morning_routine",
    uiLabel: "Утренняя рутина",
    providerDescription: "обычное утро у стола перед выходом",
    retentionPriority: 65,
    semanticKeywords: ["утро", "каждый день", "завтрак", "кофе", "просып", "рутин", "день начина"],
    audienceKeywords: ["семь", "дом", "занят", "мам", "здоров", "режим"],
    sceneArcs: [arc("morning_exit", "у домашнего стола перед выходом", [
      { name: "повседневная сумка", appearance: "матовая черная нейлоновая сумка среднего размера с черным ремнем", initialPosition: "открыта у правого края стола" },
      { name: "кружка", appearance: "одна белая керамическая кружка без рисунка", initialPosition: "стоит слева на столе" },
      { name: "ключи", appearance: "одна связка из двух серебристых ключей на черном кольце", initialPosition: "лежит между кружкой и сумкой" },
      { name: "салфетка", appearance: "одна квадратная белая хлопковая салфетка", initialPosition: "лежит перед кружкой" },
    ], [
      "кладет ключи рядом с открытой сумкой", "сдвигает кружку в сторону", "освобождает место перед собой",
      "складывает салфетку", "кладет салфетку рядом с кружкой", "придвигает сумку к себе",
      "кладет ключи в сумку", "закрывает сумку", "остается у стола с пустыми руками ближе к камере",
    ])],
    allowedProductRoles: ["hidden", "natural_use", "background_prop"], preferredProductRoles: ["natural_use", "hidden", "background_prop"],
    compatibleHooks: ["problem_in_action", "contrast", "micro_demonstration"],
    actionComplexity: "low", adjacentFormats: ["grwm"],
  },
  {
    ...shared,
    id: "post_workout",
    uiLabel: "После тренировки",
    providerDescription: "разговор сразу после тренировки рядом со спортивной сумкой",
    retentionPriority: 78,
    semanticKeywords: ["трениров", "спорт", "зал", "мышц", "восстанов", "нагруз", "фитнес", "бег"],
    audienceKeywords: ["спорт", "актив", "фитнес", "трен", "здоров"],
    sceneArcs: [arc("bench_pack", "у скамьи со спортивной сумкой после тренировки", [
      { name: "спортивная сумка", appearance: "матовая черная спортивная сумка среднего размера с черной молнией", initialPosition: "открыта справа на скамье" },
      { name: "полотенце", appearance: "одно однотонное темно-серое хлопковое полотенце", initialPosition: "лежит на левом плече героя" },
    ], [
      "снимает полотенце с плеча", "складывает полотенце один раз", "кладет полотенце в открытую сумку",
      "придвигает сумку к себе", "убирает ремень внутрь", "проверяет молнию одной рукой",
      "закрывает сумку", "встает со скамьи с сумкой", "ставит сумку рядом и завершает мысль ближе к камере",
    ])],
    allowedProductRoles: ["hidden", "natural_use", "background_prop"], preferredProductRoles: ["natural_use", "hidden", "background_prop"],
    compatibleHooks: ["problem_in_action", "result_first", "contrast", "micro_demonstration"],
    actionComplexity: "low", adjacentFormats: ["moving_vlog"],
  },
  {
    ...shared,
    id: "facetime_friend",
    uiLabel: "Разговор с подругой",
    providerDescription: "близкий домашний разговор, будто видеозвонок уже начался",
    retentionPriority: 60,
    semanticKeywords: ["расскажу", "честно", "слушай", "совет", "секрет", "не повер", "лично"],
    audienceKeywords: ["девуш", "женщ", "подруг", "личн", "дом"],
    sceneArcs: [arc("sofa_confession", "на диване у окна", [
      { name: "диван", appearance: "один прямой светло-бежевый тканевый диван без подушек", initialPosition: "неподвижно занимает задний план" },
      { name: "телефон", appearance: "один черный телефон в матовом черном чехле", initialPosition: "лежит экраном вверх справа от героя" },
    ], [
      "садится ближе к неподвижной камере", "кладет телефон экраном вниз рядом", "опирается локтем на колено",
      "выпрямляется после смыслового поворота", "делает один открытый жест рукой", "убирает руку на колено",
      "наклоняется чуть ближе", "кивает один раз", "заканчивает мысль спокойным взглядом в камеру",
    ])],
    allowedProductRoles: ["hidden", "brief_demo"], preferredProductRoles: ["hidden", "brief_demo"],
    compatibleHooks: ["result_first", "broken_expectation", "unexpected_object"],
    actionComplexity: "low", adjacentFormats: ["work_break"],
  },
  {
    ...shared,
    id: "work_break",
    uiLabel: "Рабочий перерыв",
    providerDescription: "короткий личный разговор за рабочим столом во время перерыва",
    retentionPriority: 69,
    semanticKeywords: ["работ", "офис", "дедлайн", "перерыв", "ноутбук", "устала", "занята", "встреч"],
    audienceKeywords: ["работ", "офис", "предприним", "занят", "специалист"],
    sceneArcs: [arc("desk_break", "за рабочим столом с ноутбуком", [
      { name: "ноутбук", appearance: "один темно-серый ноутбук без видимого логотипа", initialPosition: "открыт по центру стола" },
      { name: "ручка", appearance: "одна тонкая черная ручка", initialPosition: "лежит справа от ноутбука" },
      { name: "блокнот", appearance: "один закрытый бежевый блокнот формата A5 без надписей", initialPosition: "лежит слева от ноутбука" },
      { name: "стул", appearance: "один черный рабочий стул с тканевой спинкой", initialPosition: "стоит прямо перед столом" },
    ], [
      "прикрывает ноутбук одной рукой", "отодвигается от стола", "поворачивает стул к камере",
      "кладет ручку рядом с ноутбуком", "убирает блокнот в сторону", "ставит обе руки на край стола",
      "встает из-за стола", "задвигает стул", "останавливается рядом со столом лицом к камере",
    ])],
    allowedProductRoles: ["hidden", "natural_use", "background_prop"], preferredProductRoles: ["hidden", "natural_use", "background_prop"],
    compatibleHooks: ["problem_in_action", "result_first", "contrast"],
    actionComplexity: "low", adjacentFormats: ["facetime_friend"],
  },
  {
    ...shared,
    id: "whats_in_my_bag",
    uiLabel: "Что у меня в сумке",
    providerDescription: "живая разборка одной повседневной сумки перед выходом",
    retentionPriority: 81,
    semanticKeywords: ["сумк", "беру с собой", "всегда со мной", "ношу", "положила", "достаю", "поездк"],
    audienceKeywords: ["город", "занят", "путеше", "девуш", "студент", "работ"],
    sceneArcs: [arc("bag_check", "у стола с открытой повседневной сумкой", [
      { name: "повседневная сумка", appearance: "матовая черная нейлоновая сумка среднего размера с черным ремнем", initialPosition: "закрыта по центру стола" },
      { name: "ключи", appearance: "одна связка из двух серебристых ключей на черном кольце", initialPosition: "лежит в основном отделении сумки" },
      { name: "блокнот", appearance: "один тяжелый темно-серый блокнот формата A5 без надписей", initialPosition: "лежит поверх ключей в сумке" },
    ], [
      "открывает сумку и показывает свободное место рукой", "достает темно-серый блокнот", "ставит темно-серый блокнот на стол",
      "проверяет освободившееся место в сумке", "перекладывает ключи в боковой карман", "придвигает сумку ближе",
      "возвращает темно-серый блокнот в сумку", "закрывает сумку", "убирает руки с сумки и завершает мысль ближе к камере",
    ])],
    allowedProductRoles: ["hidden", "natural_use", "brief_demo"], preferredProductRoles: ["natural_use", "hidden", "brief_demo"],
    compatibleHooks: ["unexpected_object", "problem_in_action", "micro_demonstration", "broken_expectation"],
    actionComplexity: "medium", adjacentFormats: ["habit_replacement"],
  },
  {
    ...shared,
    id: "habit_replacement",
    uiLabel: "Замена привычки",
    providerDescription: "замена явно названного в реплике неудобного старого способа",
    retentionPriority: 88,
    semanticKeywords: ["замени", "вместо", "больше не", "надоело", "раньше", "теперь", "перестала"],
    audienceKeywords: ["занят", "здоров", "практич", "эконом", "привыч"],
    sceneArcs: [arc("table_swap", "у домашнего стола со старым способом, прямо названным в реплике", [
      { name: "старый предмет", appearance: "один матовый белый предмет без логотипа, тип предмета точно соответствует первой реплике", initialPosition: "лежит по центру стола" },
    ], [
      "касается названного старого предмета", "поворачивает его так, чтобы было видно неудобство", "отодвигает его к краю стола",
      "освобождает место перед собой", "кладет старый предмет в сторону", "возвращает пустую руку в кадр",
      "показывает освободившееся место", "убирает старый предмет из кадра", "завершает мысль у чистого стола с пустыми руками",
    ])],
    allowedProductRoles: ["hidden", "natural_use", "brief_demo"], preferredProductRoles: ["natural_use", "hidden", "brief_demo"],
    compatibleHooks: ["contrast", "problem_in_action", "result_first", "micro_demonstration"],
    actionComplexity: "medium", adjacentFormats: ["whats_in_my_bag"],
  },
] as const;

export function getOmniLifeFormat(id: LifeFormatId): OmniLifeFormat {
  const format = OMNI_LIFE_FORMATS.find((candidate) => candidate.id === id);
  if (!format) throw new Error(`Unknown Omni life format: ${id}`);
  return format;
}
