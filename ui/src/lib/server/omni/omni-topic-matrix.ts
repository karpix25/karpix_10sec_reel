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
 * Rank cells: unused first, then oldest reuse; rotate frames so consecutive
 * proposals vary the format, and audiences so they vary the target.
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
  const lastFrame = new Map<string, number>();
  const lastAudience = new Map<string, number>();
  let rotationCounter = 0;

  return [...pool]
    .map((cell) => {
      const used = input.usage.get(cell.signature);
      rotationCounter += 1;
      const frameSlot = lastFrame.get(cell.frameId) ?? 0;
      const audienceSlot = lastAudience.get(cell.audienceTitle) ?? 0;
      return {
        cell,
        rank: [
          used ? 1 : 0,                       // unused first
          used ? used.lastUsedAt?.getTime() ?? 0 : 0, // then oldest reuse
          audienceSlot,                        // spread audiences
          frameSlot,                           // spread frames
        ] as const,
        order: rotationCounter,
      };
    })
    .sort((left, right) => {
      for (let index = 0; index < left.rank.length; index += 1) {
        if (left.rank[index] !== right.rank[index]) return left.rank[index] - right.rank[index];
      }
      return left.order - right.order;
    })
    .slice(0, input.limit)
    .map((entry) => {
      lastFrame.set(entry.cell.frameId, (lastFrame.get(entry.cell.frameId) ?? 0) + 1);
      lastAudience.set(entry.cell.audienceTitle, (lastAudience.get(entry.cell.audienceTitle) ?? 0) + 1);
      return entry.cell;
    });
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
