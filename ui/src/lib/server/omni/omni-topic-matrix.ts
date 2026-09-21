import type { TopicAxes } from "./omni-product-topic-axes";
import type { ScriptwriterFrame } from "./omni-scriptwriter-frames";

/**
 * The topic matrix: cells = benefit × audience × frame. Topics scale with the
 * product card, not with the reference count; references contribute the frame
 * pool (and hooks elsewhere). Used cells rotate with a cooldown so a product
 * with a 400-video monthly plan never literally repeats early.
 */

export const TOPIC_CELL_COOLDOWN_DAYS = 21;

export type MatrixCell = {
  signature: string;
  benefitTitle: string;
  audienceTitle: string;
  frameId: string;
  frameTitle: string;
  topic: string;
};

export type MatrixCellUsage = { lastUsedAt: Date | null; timesUsed: number };

function cellSignature(benefitTitle: string, audienceTitle: string, frameId: string) {
  return [benefitTitle, audienceTitle, frameId]
    .map((part) => part.toLowerCase().replace(/\s+/g, " ").trim())
    .join("::");
}

export function buildMatrixCells(axes: TopicAxes, frames: ScriptwriterFrame[]): MatrixCell[] {
  const usableFrames = frames.length ? frames : [];
  const cells: MatrixCell[] = [];
  for (const benefit of axes.benefits) {
    for (const audience of axes.audiences) {
      for (const frame of usableFrames) {
        cells.push({
          signature: cellSignature(benefit.title, audience.title, frame.id),
          benefitTitle: benefit.title,
          audienceTitle: audience.title,
          frameId: frame.id,
          frameTitle: frame.title,
          topic: `${benefit.title} — ${audience.title}`,
        });
      }
    }
  }
  return cells;
}

function cooldownExpired(lastUsedAt: Date | null, now: Date) {
  if (!lastUsedAt) return true;
  return (now.getTime() - lastUsedAt.getTime()) / 86_400_000 >= TOPIC_CELL_COOLDOWN_DAYS;
}

/**
 * Rank cells: unused first, then oldest reuse; greedy interleaving so
 * consecutive proposals vary audience, benefit and frame instead of walking
 * one row of the matrix.
 */
export function pickMatrixProposals(input: {
  cells: MatrixCell[];
  usage: Map<string, MatrixCellUsage>;
  limit: number;
  now?: Date;
}): MatrixCell[] {
  const now = input.now || new Date();
  const fresh = input.cells.filter((cell) => cooldownExpired(input.usage.get(cell.signature)?.lastUsedAt ?? null, now));
  const pool = fresh.length >= input.limit ? fresh : input.cells;
  const candidates = [...pool]
    .map((cell) => {
      const used = input.usage.get(cell.signature);
      return {
        cell,
        usedRank: used ? 1 : 0,
        lastUsed: used?.lastUsedAt?.getTime() ?? 0,
      };
    })
    .sort((left, right) =>
      left.usedRank - right.usedRank || left.lastUsed - right.lastUsed
    );

  const audienceCount = new Map<string, number>();
  const benefitCount = new Map<string, number>();
  const frameCount = new Map<string, number>();
  const count = (map: Map<string, number>, key: string) => map.get(key) ?? 0;

  const proposals: MatrixCell[] = [];
  while (proposals.length < input.limit && candidates.length) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index];
      // Audience variety dominates, then benefit, then frame; usedRank keeps
      // unused cells ahead of stale-reuse ones within the same spread score.
      const score =
        candidate.usedRank * 1000 +
        count(audienceCount, candidate.cell.audienceTitle) * 9 +
        count(benefitCount, candidate.cell.benefitTitle) * 3 +
        count(frameCount, candidate.cell.frameId);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    const [picked] = candidates.splice(bestIndex, 1);
    proposals.push(picked.cell);
    audienceCount.set(picked.cell.audienceTitle, count(audienceCount, picked.cell.audienceTitle) + 1);
    benefitCount.set(picked.cell.benefitTitle, count(benefitCount, picked.cell.benefitTitle) + 1);
    frameCount.set(picked.cell.frameId, count(frameCount, picked.cell.frameId) + 1);
  }

  return proposals;
}

export function matrixUsageFromRows(rows: Array<{ matrix_cell: unknown; created_at: string }>) {
  const usage = new Map<string, MatrixCellUsage>();
  for (const row of rows) {
    const cell = row.matrix_cell as { signature?: unknown } | null;
    if (!cell || typeof cell.signature !== "string" || !cell.signature) continue;
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    const existing = usage.get(cell.signature);
    if (!existing) {
      usage.set(cell.signature, { lastUsedAt: createdAt, timesUsed: 1 });
    } else {
      existing.timesUsed += 1;
      if (createdAt && (!existing.lastUsedAt || createdAt > existing.lastUsedAt)) {
        existing.lastUsedAt = createdAt;
      }
    }
  }
  return usage;
}
