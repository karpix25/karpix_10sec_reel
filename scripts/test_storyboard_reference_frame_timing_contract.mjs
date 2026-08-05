import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-storyboard-frame-timing-"));
const compiled = join(output, "compiled");
const require = createRequire(import.meta.url);

try {
  writeFileSync(join(output, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      skipLibCheck: true,
    },
    include: [join(ui, "src/lib/server/omni/storyboard-reference-frame-timing.ts")],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", join(output, "tsconfig.json")], { cwd: ui, stdio: "inherit" });

  const timing = require(join(compiled, "lib/server/omni/storyboard-reference-frame-timing.js"));
  const segments = [
    { index: 1, durationSeconds: 4, wordCount: 6 },
    { index: 2, durationSeconds: 6, wordCount: 4 },
  ];
  const words = Array.from({ length: 10 }, (_, index) => ({
    start: index * 1.2,
    end: index * 1.2 + 0.8,
  }));

  assert.equal(timing.STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT, 2);
  const first = timing.buildSegmentReferenceSeekSecondsFromWords({
    segment: segments[0],
    segments,
    words,
  });
  const second = timing.buildSegmentReferenceSeekSecondsFromWords({
    segment: segments[1],
    segments,
    words,
  });
  assert.equal(first.length, 2);
  assert.equal(second.length, 2);
  assert.ok(first.every((seek) => seek > words[0].start && seek < words[5].end));
  assert.ok(second.every((seek) => seek > words[5].start && seek < words[9].end));
  assert.deepEqual(
    timing.buildSegmentReferenceSeekSecondsFromWords({ segment: segments[0], segments, words: [] }),
    []
  );

  const legacy = timing.buildSegmentReferenceSeekSeconds({
    segment: { index: 1, durationSeconds: 4 },
    segments: segments.map(({ index, durationSeconds }) => ({ index, durationSeconds })),
    sourceDurationSeconds: 20,
  });
  assert.equal(legacy.length, 2);
  assert.ok(legacy.every((seek) => seek > 0 && seek < 10));

  console.log("Storyboard reference frame timing contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
