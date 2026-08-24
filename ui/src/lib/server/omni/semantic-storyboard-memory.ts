import pool from "@/lib/db";
import {
  buildPositiveSemanticMemoryInstruction,
  type SemanticStoryboardMemoryIssue,
  type SemanticStoryboardMemoryRule,
  type SemanticStoryboardMemoryScope,
} from "./semantic-storyboard-memory-contract";
import { ensureOmniSchema } from "./schema";

const MIN_OCCURRENCES_TO_APPLY = 2;
const MAX_RULES_PER_PROMPT = 6;

export type { SemanticStoryboardMemoryRule, SemanticStoryboardMemoryScope } from "./semantic-storyboard-memory-contract";

export async function loadSemanticStoryboardMemory(
  scope: SemanticStoryboardMemoryScope,
): Promise<SemanticStoryboardMemoryRule[]> {
  try {
    await ensureOmniSchema();
    const { rows } = await pool.query<{
      issue_code: string;
      positive_instruction: string;
      occurrence_count: number;
    }>(
      `SELECT issue_code, positive_instruction, occurrence_count
       FROM omni_semantic_storyboard_memory_rules
       WHERE project_id = $1
         AND product_id = $2
         AND reference_format_mode = $3
         AND reference_scene_mode = $4
         AND occurrence_count >= $5
       ORDER BY occurrence_count DESC, last_seen_at DESC
       LIMIT $6`,
      [
        scope.projectId,
        scope.productId,
        scope.referenceFormatMode,
        scope.referenceSceneMode,
        MIN_OCCURRENCES_TO_APPLY,
        MAX_RULES_PER_PROMPT,
      ],
    );
    return rows.map((row) => ({
      issueCode: row.issue_code,
      positiveInstruction: row.positive_instruction,
      occurrenceCount: Number(row.occurrence_count),
    }));
  } catch (error) {
    console.warn("Omni semantic storyboard memory read unavailable; continuing without learned rules:", error);
    return [];
  }
}

export async function rememberSemanticStoryboardIssues(input: {
  scope: SemanticStoryboardMemoryScope;
  issues: readonly SemanticStoryboardMemoryIssue[];
  repairInstructions: readonly string[];
}): Promise<void> {
  try {
    await ensureOmniSchema();
    const seenCodes = new Set<string>();
    for (const [index, issue] of input.issues.entries()) {
      const issueCode = issue.code.trim();
      if (!issueCode || seenCodes.has(issueCode)) continue;
      seenCodes.add(issueCode);
      const positiveInstruction = buildPositiveSemanticMemoryInstruction(
        issue,
        input.repairInstructions[index],
      );
      await pool.query(
        `INSERT INTO omni_semantic_storyboard_memory_rules (
           project_id,
           product_id,
           reference_format_mode,
           reference_scene_mode,
           issue_code,
           positive_instruction,
           occurrence_count,
           last_seen_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, 1, CURRENT_TIMESTAMP)
         ON CONFLICT (project_id, product_id, reference_format_mode, reference_scene_mode, issue_code)
         DO UPDATE SET
           positive_instruction = EXCLUDED.positive_instruction,
           occurrence_count = omni_semantic_storyboard_memory_rules.occurrence_count + 1,
           last_seen_at = CURRENT_TIMESTAMP`,
        [
          input.scope.projectId,
          input.scope.productId,
          input.scope.referenceFormatMode,
          input.scope.referenceSceneMode,
          issueCode,
          positiveInstruction,
        ],
      );
    }
  } catch (error) {
    console.warn("Omni semantic storyboard memory write unavailable; continuing:", error);
  }
}
