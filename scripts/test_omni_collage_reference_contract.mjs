import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-collage-prompt-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);

try {
  writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      baseUrl: join(ui, "src"),
      paths: { "@/*": ["*"] },
      rootDir: join(ui, "src"),
      outDir: compiled,
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: [
      join(ui, "src/lib/omni/**/*.ts"),
      join(ui, "src/lib/server/omni/**/*.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });
  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const input = buildReel50LikeInput();

  process.env.OMNI_PROVIDER_PROMPT_STYLE = "simple_full_body";
  const prompts = buildOmniSegmentPrompts(input);
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;

  const joinedPrompt = prompts.map((item) => item.prompt).join("\n");
  const firstPrompt = prompts[0].prompt;
  const firstPlan = prompts[0].creativePlan;

  assert.equal(prompts.length, 3, "test fixture should keep the reel 50 reference while fitting current speech budgets");
  assert.equal(firstPlan.productRole, "background_prop", "collage product background must be visible from segment 1");
  assert.equal(prompts[0].referenceUrl, "https://example.com/orange-collagen.png", "segment 1 must send the product reference");
  assert.ok(joinedPrompt.includes("REFERENCE LAYOUT: COLLAGE PICTURE-IN-PICTURE"), "collage layout must reach provider prompt");
  assert.ok(joinedPrompt.includes("lower-left corner"), "lower-left avatar placement must reach provider prompt");
  assert.ok(joinedPrompt.includes("thick white paper outline"), "paper cutout outline must reach provider prompt");
  assert.ok(joinedPrompt.includes("full-frame background layer"), "background layer must reach provider prompt");
  assert.ok(joinedPrompt.includes("new product reference"), "original product must be replaced by our product reference");
  assert.ok(firstPrompt.includes("collage/PIP opening frame"), "shot plan must not degrade into a generic talking-head opening");
  assert.ok(firstPrompt.includes("background layer prominently uses the new product reference"), "opening shot must keep product background");
  assert.ok(!/use the original reference only for transferable direction/u.test(joinedPrompt), "same-domain collage reference must not be downgraded to style-only");
  assert.ok(!/продукт и упаковка не появляются/u.test(firstPrompt), "opening segment must not hide the product");
  assert.ok(
    !/спокойный фон|маленький столик|new product reference in a clean static cutaway|show the new product reference clearly on a clean surface/u.test(joinedPrompt),
    "collage prompt must not leak generic talking-head-home props or table cutaways"
  );
  assert.ok(
    prompts.every((item) => item.validation.valid),
    `collage prompts must pass validation: ${JSON.stringify(prompts.map((item) => item.validation))}`
  );

  if (process.env.PRINT_COLLAGE_PROMPT_SUMMARY === "1") {
    console.log(JSON.stringify({
      firstSegment: {
        productRole: firstPlan.productRole,
        referenceUrl: prompts[0].referenceUrl,
        promptExcerpt: firstPrompt.split("\n").filter((line) =>
          /REFERENCE LAYOUT|REFERENCE SCENE PASSPORT|collage\/PIP opening|CLEAN FRAME/iu.test(line)
        ),
      },
    }, null, 2));
  }

  console.log("Omni collage reference contract checks passed");
} finally {
  rmSync(output, { recursive: true, force: true });
  delete process.env.OMNI_PROVIDER_PROMPT_STYLE;
}

function buildReel50LikeInput() {
  return {
    generatedScript: {
      id: 54,
      project_id: 6,
      product_id: 6,
      script: "Пить или не пить коллаген? Новые исследования дают однозначный ответ. Вы наверняка слышали, что коллаген это просто белок. Но это не так. Он работает как строительный материал и сигнал для обновления кожи. Даже распавшийся коллаген активирует гены коллагена в коже. Улучшает ее показатели и маркеры старения. В описании вы найдете артикул нашего апельсинового коллагена.",
      source_snapshot: {
        director_analysis: buildCollageDirectorBrief(),
      },
    },
    legacyTranscript: null,
    product: {
      id: 6,
      project_id: 6,
      name: "Коллаген",
      description: "Апельсиновый коллаген, желеобразное",
      product_reference_notes: null,
      avatar_reference_notes: null,
      product_refs: [{
        id: "collagen-product",
        url: "https://example.com/orange-collagen.png",
        kind: "image",
        role: "product_primary",
        is_primary: true,
      }],
      avatar_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 6,
      project_id: 6,
      display_name: "Героиня",
      prompt: "европейская Девушка 30 лет в домашней обстановке",
      reference_url: "https://example.com/avatar.jpg",
      status: "approved",
      provider: "kie-omni",
      kie_character_id: "ae9e35d74fe44622bab11fbcdcb4b193",
      kie_character_status: "completed",
      kie_character_payload: null,
      is_active: true,
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-15T00:00:00.000Z",
    },
    segmentCount: 3,
    segmentSeconds: 10,
    segmentDurationsSeconds: [10, 10, 10],
    brief: null,
    targetAudience: "женщины, уход за собой",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
}

function buildCollageDirectorBrief() {
  return {
    visual_hook: {
      action: "Speaker positioned in the lower-left corner delivering direct address while the background rapidly cycles through scientific and product visuals.",
      retention_trigger: "Constant visual change in the background maintains viewer engagement while the speaker provides a steady, continuous presence.",
    },
    atmosphere: {
      mood: "Educational, clinical, informative, and clean.",
      setting: "Minimalist studio setup for the speaker; backgrounds feature labs, abstract digital environments, and macro product close-ups.",
      lighting: "Bright, even, soft lighting on the speaker; varied lighting in B-roll including studio setups, lab environments, and glowing digital animations.",
      color_grading: "Clean, slightly cool tones on the speaker; high contrast and vibrant, glowing colors in the 3D animations.",
    },
    clothing: {
      style: "Minimalist, professional casual.",
      fit_details: "Sleeveless V-neck top with front buttons, small black circular lapel microphone attached to the neckline.",
      color_palette: ["White", "Pale blue"],
    },
    camera: {
      shot_types: ["Medium close-up", "Macro", "Medium shot"],
      angles: ["Eye-level"],
      movements: ["Static"],
      stabilization: "Fixed mount or tripod for the speaker; smooth, controlled motion in some B-roll clips.",
    },
    montage_rhythm: {
      cut_pace: "Fast, with background visuals changing every 2-4 seconds.",
      beat_sync: "Cuts align with the speaker's narrative points and topic shifts.",
      transition_style: ["Hard cuts"],
    },
    action_beats: [
      { timestamp_sec: 0, action_description: "Speaker talking directly to the camera.", actor_gesture: "Subtle head movements and facial expressions." },
      { timestamp_sec: 2, action_description: "Background shifts to a close-up of a blue product container.", actor_gesture: "Speaker continues talking." },
      { timestamp_sec: 8, action_description: "Background shifts to a 3D animation of textured skin tissue.", actor_gesture: "Speaker continues talking." },
    ],
    reusable_mechanics: {
      visual_mechanics: [
        "Lower-corner framing for the main speaker.",
        "Rapid swapping of background B-roll to match spoken topics.",
        "Integration of 3D and 2D scientific animations as background context.",
      ],
      safe_zones_for_elements: "Lower-left quadrant is occupied by the speaker; upper and right areas are free for background visuals.",
      looping_pattern: "Continuous direct address with a steady stream of changing background clips.",
    },
  };
}

function findFile(dir, fileName) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      try {
        return findFile(path, fileName);
      } catch {
        continue;
      }
    }
    if (entry.name === fileName) return path;
  }
  throw new Error(`Could not find ${fileName} in ${dir}`);
}
