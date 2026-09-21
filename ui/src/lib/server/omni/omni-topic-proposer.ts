/**
 * Topic proposals for the scriptwriter role.
 *
 * Deterministic v1: topics come straight from the accumulated reference
 * materials (core concepts + hook mechanisms), ranked by novelty against the
 * scripts already produced for the product. No LLM calls, no cost.
 */

import { collectScriptwriterFrames, type ScriptwriterFrame } from "./omni-scriptwriter-frames";

export type TopicProposalMaterial = {
  material_id: number;
  topic: string | null;
  core_concept: string | null;
  conclusion: string | null;
  hook_mechanism: string | null;
  visual_hook_action: string | null;
  format_mode: string | null;
  product_position: string | null;
  narrative_structure: string[];
};

export type ExistingScriptLike = {
  script: string;
  title?: string | null;
  hook?: string | null;
};

export type ScriptwriterTopicProposal = {
  id: string;
  topic: string;
  rationale: string;
  source_material_id: number;
  suggested_frame_id: string;
  format_mode: string | null;
  hook_mechanism: string | null;
};

const MIN_SIGNIFICANT_WORD_LENGTH = 4;

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= MIN_SIGNIFICANT_WORD_LENGTH);
}

/** Concept is "covered" when most of its significant words already appear in an existing script. */
export function isConceptCoveredByScripts(concept: string, existingScripts: ExistingScriptLike[]) {
  const conceptWords = new Set(tokenize(concept));
  if (!conceptWords.size) return true;
  for (const existing of existingScripts) {
    const produced = new Set(tokenize(`${existing.title || ""} ${existing.hook || ""} ${existing.script}`));
    if (!produced.size) continue;
    let hits = 0;
    for (const word of conceptWords) if (produced.has(word)) hits += 1;
    if (hits / conceptWords.size >= 0.6) return true;
  }
  return false;
}

function materialProductPriority(productPosition: string | null) {
  if (productPosition === "hook") return 0;
  if (productPosition === "body") return 1;
  if (productPosition === "payoff") return 2;
  return 3; // never / unknown: pure form reference
}

export function suggestFrameId(material: TopicProposalMaterial, frames: ScriptwriterFrame[]) {
  const referenceFrame = frames.find(
    (frame) => frame.source === "reference" && frame.structure.join(">") === material.narrative_structure.join(">")
  );
  if (referenceFrame) return referenceFrame.id;
  const builtin = frames.find((frame) => frame.structure.length === material.narrative_structure.length);
  return (builtin || frames[0])?.id || "hook-problem-solution";
}

export function proposeScriptwriterTopics(
  materials: TopicProposalMaterial[],
  existingScripts: ExistingScriptLike[],
  limit = 5
): ScriptwriterTopicProposal[] {
  const frames = collectScriptwriterFrames(materials);

  // Older analyses have no content_meaning block; fall back to the snapshot topic
  // so the whole accumulated library still yields proposals.
  const candidates = materials
    .filter((material) => ((material.core_concept || material.topic) || "").trim().length >= 8)
    .map((material) => {
      const concept = (material.core_concept || material.topic || "").trim();
      return {
        material,
        concept,
        covered: isConceptCoveredByScripts(concept, existingScripts),
        priority: materialProductPriority(material.product_position),
      };
    });

  const uncovered = candidates.filter((candidate) => !candidate.covered);
  const covered = candidates.filter((candidate) => candidate.covered);

  const formatRotation = new Map<string, number>();
  const ranked = [...uncovered, ...covered].sort((left, right) => {
    if (left.covered !== right.covered) return left.covered ? 1 : -1;
    if (left.priority !== right.priority) return left.priority - right.priority;
    const leftUsed = formatRotation.get(left.material.format_mode || "") || 0;
    const rightUsed = formatRotation.get(right.material.format_mode || "") || 0;
    return leftUsed - rightUsed;
  });

  const proposals: ScriptwriterTopicProposal[] = [];
  const emittedConcepts = new Set<string>();
  for (const candidate of ranked) {
    if (proposals.length >= limit) break;
    const conceptSignature = candidate.concept.toLowerCase().replace(/\s+/g, " ").trim();
    if (emittedConcepts.has(conceptSignature)) continue;
    emittedConcepts.add(conceptSignature);
    const formatKey = candidate.material.format_mode || "";
    formatRotation.set(formatKey, (formatRotation.get(formatKey) || 0) + 1);
    const material = candidate.material;
    // Prefer the conclusion as the topic: it carries the concrete subject
    // ("Langkawi, Malaysia is the ultimate budget escape") while core concepts
    // stay generic, which previously let the model invent a different place.
    const topicText = (material.conclusion || candidate.concept).trim().slice(0, 160);
    proposals.push({
      id: `topic-${material.material_id}`,
      topic: topicText,
      rationale: [
        material.hook_mechanism || material.visual_hook_action
          ? `хук: ${material.hook_mechanism || material.visual_hook_action}`
          : null,
        material.format_mode ? `формат: ${material.format_mode}` : null,
        candidate.covered ? "похожая тема уже снималась — нужен новый угол" : "тема ещё не раскрыта для этого продукта",
      ]
        .filter(Boolean)
        .join("; "),
      source_material_id: material.material_id,
      suggested_frame_id: suggestFrameId(material, frames),
      format_mode: material.format_mode,
      hook_mechanism: material.hook_mechanism,
    });
  }

  return proposals;
}
