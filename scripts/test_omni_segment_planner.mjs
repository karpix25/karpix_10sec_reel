import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-segment-planner-"));
const require = createRequire(import.meta.url);

try {
  execFileSync(
    join(ui, "node_modules/.bin/tsc"),
    [
      "src/lib/server/omni/omni-duration-planner.ts",
      "src/lib/server/omni/omni-script-segmentation.ts",
      "--outDir", output,
      "--module", "commonjs",
      "--target", "es2022",
      "--skipLibCheck",
    ],
    { cwd: ui, stdio: "inherit" }
  );

  const { planOmniReelSegments } = require(join(output, "omni-duration-planner.js"));
  const { reconstructVoiceSegments } = require(join(output, "omni-script-segmentation.js"));

  for (const [wordCount, expectedSegments] of [[40, 2], [60, 3], [80, 4]]) {
    const script = makeScript(wordCount);
    const plan = planOmniReelSegments(script);
    assert.equal(plan.segmentCount, expectedSegments, `${wordCount} words should use ${expectedSegments} segments`);
    assert.equal(plan.durationSeconds, expectedSegments * 10);
    assert.ok(plan.segmentWordCounts.every((count) => count <= 24), "every segment must fit 24 words");
    assert.equal(reconstructVoiceSegments(plan.segments), script, "the source script must reconstruct exactly");
  }

  const cta = [
    "Этот предмет помогает быстро навести порядок дома без лишних движений и сложных привычек.",
    "Напишите кодовое слово ХОЧУ в комментариях.",
    "Я отправлю подробности и покажу простой способ применения прямо сегодня.",
  ].join(" ");
  const ctaPlan = planOmniReelSegments(cta);
  assert.ok(
    ctaPlan.segments.some((segment) => segment.text.includes("Напишите кодовое слово ХОЧУ в комментариях.")),
    "the protected CTA must remain inside one segment"
  );
  assert.equal(reconstructVoiceSegments(ctaPlan.segments), cta);

  assert.throws(
    () => planOmniReelSegments(makeScript(97)),
    (error) => error instanceof Error && /97 слов.*Максимум 96 слов/u.test(error.message)
  );

  console.log("Omni segment planner regression checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}

function makeScript(wordCount) {
  return Array.from(
    { length: wordCount },
    (_, index) => `слово${index + 1}${(index + 1) % 20 === 0 ? "." : ""}`
  ).join(" ");
}
