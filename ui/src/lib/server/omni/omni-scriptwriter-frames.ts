/**
 * Frame catalog for the scriptwriter role.
 *
 * Frames are narrative skeletons ("крючок → проблема → решение → CTA" etc.).
 * The catalog always contains the built-in frames plus frames derived from
 * the narrative structures observed in reference materials, so the
 * scriptwriter can vary its structure instead of reusing one skeleton.
 */

export type ScriptwriterFrame = {
  id: string;
  title: string;
  description: string;
  structure: string[];
  source: "builtin" | "reference";
};

export const BUILTIN_SCRIPTWRITER_FRAMES: ScriptwriterFrame[] = [
  {
    id: "hook-problem-solution",
    title: "Крючок — Проблема — Решение — Призыв",
    description: "Классика прямого отклика: цепляющая первая секунда, узнаваемая боль, продукт как решение, призыв.",
    structure: ["Крючок", "Проблема", "Решение (продукт)", "Доказательство", "Призыв"],
    source: "builtin",
  },
  {
    id: "contrast-before-after",
    title: "Контраст До — После",
    description: "Резкое противопоставление жизни без продукта и с ним; работает через визуальный контраст сцен.",
    structure: ["Крючок", "До (без продукта)", "Переломный момент", "После (с продуктом)", "Призыв"],
    source: "builtin",
  },
  {
    id: "mistake-breakdown",
    title: "Разбор ошибок",
    description: "Автор разбирает частые ошибки аудитории и мягко показывает, как продукт их закрывает.",
    structure: ["Крючок (смелое утверждение)", "Ошибка 1", "Ошибка 2", "Как правильно (продукт)", "Призыв"],
    source: "builtin",
  },
  {
    id: "myth-busting",
    title: "Разрушение мифа",
    description: "Берём распространённый миф ниши, разбиваем его фактами и демонстрацией продукта.",
    structure: ["Миф (крючок)", "Почему это неправда", "Демонстрация правды (продукт)", "Призыв"],
    source: "builtin",
  },
  {
    id: "personal-story",
    title: "Личная история",
    description: "Мини-сторителлинг от первого лица: ситуация, эмоция, поворот через продукт, итог.",
    structure: ["Ситуация (крючок)", "Эмоция или конфликт", "Поворот (продукт)", "Итог и вывод", "Призыв"],
    source: "builtin",
  },
  {
    id: "quick-list",
    title: "Быстрый список",
    description: "Динамичный перечислительный формат: «три причины», «два способа» — с продуктом в ключевом пункте.",
    structure: ["Крючок-обещание", "Пункт 1", "Пункт 2", "Пункт 3 (продукт)", "Призыв"],
    source: "builtin",
  },
];

type FrameMaterialLike = {
  narrative_structure?: string[];
  hook_mechanism?: string | null;
};

function frameSignature(structure: string[]) {
  return structure
    .map((step) => step.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""))
    .filter(Boolean)
    .join(">");
}

function normalizeStructureSteps(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((step): step is string => typeof step === "string" && step.trim().length >= 2)
    .map((step) => step.trim())
    .slice(0, 8);
}

/** Builtin frames plus unique frames observed in reference materials. */
export function collectScriptwriterFrames(materials: FrameMaterialLike[]): ScriptwriterFrame[] {
  const frames = [...BUILTIN_SCRIPTWRITER_FRAMES];
  const seen = new Set(frames.map((frame) => frameSignature(frame.structure)));

  materials.forEach((material, index) => {
    const structure = normalizeStructureSteps(material.narrative_structure);
    if (structure.length < 3) return;
    const signature = frameSignature(structure);
    if (seen.has(signature)) return;
    seen.add(signature);
    frames.push({
      id: `reference-${index + 1}`,
      title: `Из референса: ${structure[0]} → ${structure[structure.length - 1]}`,
      description: material.hook_mechanism?.trim() || "Структура, выведенная из разбора референсного ролика.",
      structure,
      source: "reference",
    });
  });

  return frames;
}

export function findScriptwriterFrame(frames: ScriptwriterFrame[], frameId: string | null | undefined) {
  if (!frameId) return null;
  return frames.find((frame) => frame.id === frameId) || null;
}

export function pickDefaultScriptwriterFrame(frames: ScriptwriterFrame[], avoidFrameIds: string[] = []) {
  return frames.find((frame) => !avoidFrameIds.includes(frame.id)) || frames[0] || null;
}
