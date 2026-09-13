import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const ui = join(root, "ui");
const output = mkdtempSync(join(tmpdir(), "omni-prompt-speech-"));
const compiled = join(output, "compiled");
const tsconfig = join(output, "tsconfig.json");
const require = createRequire(import.meta.url);
const originalFetch = global.fetch;

try {
  global.fetch = async () => { throw new Error("Network calls are forbidden in this local regression"); };
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
      join(ui, "src/lib/audio-library/moods.ts"),
    ],
  }));

  execFileSync(join(ui, "node_modules/.bin/tsc"), ["--project", tsconfig], { cwd: ui, stdio: "inherit" });

  const contractOutput = findFile(compiled, "creative-contract.js");
  const aliasContract = join(output, "node_modules", "@", "lib", "omni", "creative-contract.js");
  mkdirSync(dirname(aliasContract), { recursive: true });
  copyFileSync(contractOutput, aliasContract);
  const moodsOutput = findFile(compiled, "moods.js");
  const aliasMoods = join(output, "node_modules", "@", "lib", "audio-library", "moods.js");
  mkdirSync(dirname(aliasMoods), { recursive: true });
  copyFileSync(moodsOutput, aliasMoods);
  for (const fileName of ["omni-storyboard-timing.js", "omni-storyboard-types.js", "omni-storyboard-contract.js"]) {
    const source = findFile(compiled, fileName);
    const target = join(output, "node_modules", "@", "lib", "omni", "storyboard", fileName);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }

  const { buildOmniSegmentPrompts } = require(findFile(compiled, "omni-prompt-builder.js"));
  const { validatePromptVoiceoverIsolation } = require(findFile(compiled, "omni-prompt-validator.js"));
  const { buildStoryboardImagePrompt } = require(findFile(compiled, "omni-storyboard-image-prompt.js"));
  const { renderFrameTransitionNote, renderReferenceTransitionCue } = require(findFile(compiled, "omni-storyboard-effects.js"));
  const { extractDirectorReferenceVideoUrl } = require(findFile(compiled, "director-reference-video-url.js"));
  const frameTiming = require(findFile(compiled, "storyboard-reference-frame-timing.js"));
  const prompts = buildOmniSegmentPrompts(buildInput());

  const filmTransitionBrief = { montage_rhythm: { transition_style: ["film burn / light leak"] } };
  assert.match(renderReferenceTransitionCue(filmTransitionBrief), /film burn\/light leak/iu);
  assert.match(renderFrameTransitionNote(filmTransitionBrief, 2), /film-burn\/light-leak/iu);

  assert.deepEqual(validatePromptVoiceoverIsolation(prompts), []);
  const sizes = [];
  for (const item of prompts) {
    const frames = item.storyboardPlan.frames;
    assert.equal(normalizedCount(item.prompt, item.voiceoverText), 1);
    assert.match(item.prompt, /@storyboard_file/u);
    assert.match(item.prompt, /итог состоит из живых кадров/u);
    assert.match(item.prompt, /VISUAL AUTHORITY/u);
    assert.match(item.prompt, /Лицо и личность персонажа бери из avatar\/character reference/u);
    assert.match(item.prompt, /WARDROBE CONTINUITY/u);
    assert.match(item.prompt, /Точная реплика.*на русском языке/u);
    assert.match(item.prompt, /одна непрерывная реплика/u);
    assert.match(item.prompt, /не требует паузы каждые две секунды/u);
    assert.match(item.prompt, /Без фоновой музыки и субтитров/u);
    assert.doesNotMatch(item.prompt, /REFERENCE SHOT CONTRACT|SOURCE INTERVAL OVERRIDE|Реплика персонажа:|речь:\s*"/iu);
    assert.deepEqual([...item.prompt.matchAll(/^\[(\d+)-(\d+)s\]/gmu)].map((match) => [+match[1], +match[2]]), [[0, 2], [2, 4], [4, 6]]);
    assert.equal(frames.length, 3);
    assert.deepEqual(frames.map((frame) => frame.spokenText.split(/\s+/u).length), [4, 4, 4]);
    assert.deepEqual(item.creativePlan.productVisibleByFrame, [false, true, false]);
    assert.equal(frames[1].speechMode, "voiceover_only");
    assert.match(frames[1].visualAction, /без людей и рук/u);
    assert.doesNotMatch(frames[1].visualAction, /держит|берёт|берет|поворачивает продукт|holding/iu);
    assert.match(item.prompt, /@product_file/u);
    assert.match(item.prompt, /неизменная упаковка/u);
    sizes.push({ kind: "video", index: item.index, chars: item.prompt.length, max: 5600 });
    const imagePrompt = buildStoryboardImagePrompt({
      segmentIndex: item.index, storyboard: item.storyboardPlan, productName: "Аэрогриль",
      avatarReferenceUrl: "https://example.com/avatar.png", productReferenceUrls: ["https://example.com/air-fryer.png"],
      directorReferenceImageUrls: ["https://example.com/source-frame.jpg"],
      canonicalStoryboardReferenceUrl: item.index > 1 ? "https://example.com/canonical.png" : null,
    });
    assert.match(imagePrompt, /без букв, цифр, реплик, заголовков/u);
    assert.match(imagePrompt, /ровно 3 вертикальных панелей/u);
    assert.ok(/FEATURED PERSON LOCK: лицо и личность главного героя берутся из @file1/u.test(imagePrompt), "image panels must preserve avatar identity");
    assert.match(imagePrompt, /OUTFIT LOCK/u);
    if (item.index > 1) assert.match(imagePrompt, /эталон одежды из первого утверждённого storyboard/u);
    assert.match(imagePrompt, /точный продукт Аэрогриль/u);
    assert.doesNotMatch(imagePrompt.split("\n").find((line) => line.includes("product reference images:")), /смартфон|smartphone/iu);
    assert.match(imagePrompt, /впервые появляется только в панели 2/u);
    assert.match(imagePrompt, /никогда не являются нейтральным реквизитом/u);
    const panels = imagePrompt.split("\n").filter((line) => /^Кадр \d+:/u.test(line));
    assert.equal(panels.length, 3);
    panels.forEach((panel, index) => {
      assert.ok(panel.includes(frames[index].spokenText));
      assert.ok(panel.includes(frames[index].environment), "full environment must survive");
      if (index !== 1) assert.ok(panel.includes(frames[index].wardrobe), "full presenter wardrobe must survive");
    });
    assert.match(panels[1], /subject=product_only; avatar_allowed=false/u);
    assert.match(panels[0], /продукт в этом кадре не показывай/u);
    assert.match(panels[2], /продукт в этом кадре не показывай/u);
    sizes.push({ kind: "image", index: item.index, chars: imagePrompt.length, max: 4300 });
  }

  const pipImagePrompt = buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: prompts[0].storyboardPlan,
    productName: "Аэрогриль",
    avatarReferenceUrl: "https://example.com/avatar.png",
    directorReferenceImageUrls: ["https://example.com/source-frame-1.jpg"],
    directorBrief: {
      visual_hook: { action: "presenter in lower-left cutout", retention_trigger: "" },
      atmosphere: { mood: "", lighting: "", color_grading: "", setting: "" },
      camera: { shot_types: [], angles: [], movements: [], stabilization: "" },
      action_beats: [],
      reusable_mechanics: {
        visual_mechanics: ["picture-in-picture"],
        safe_zones_for_elements: "lower-left",
        looping_pattern: "",
      },
    },
  });
  assert.ok(pipImagePrompt.includes("REFERENCE LAYOUT: оригинал целиком в PIP/collage"), "PIP storyboard prompt must preserve the reference layout");
  assert.ok(pipImagePrompt.includes("не делай centered talking-head"), "PIP storyboard prompt must reject a generic centered presenter shot");

  const physicalContract = "The product remains a stable black countertop air fryer with the same hard shell, basket shape, matte finish, and compact appliance proportions throughout the scene. It stands on a stable counter without people or hands and stays visually identical to the reference.";
  const physicalInput = buildInput();
  physicalInput.product.product_physical_contract = physicalContract;
  physicalInput.product.product_physical_contract_status = "edited";
  const physicalPrompts = buildOmniSegmentPrompts(physicalInput);
  assert.ok(
    physicalPrompts.some((item) => item.prompt.includes("PRODUCT PHYSICAL CONTRACT:")),
    "Omni provider prompts must include the physical contract when the product appears"
  );
  assert.ok(
    physicalPrompts.some((item) => item.prompt.includes("stable black countertop air fryer")),
    "Omni provider prompts must carry the positive physical target state"
  );

  const physicalStoryboard = physicalPrompts.find((item) => item.storyboardPlan)?.storyboardPlan;
  assert.ok(physicalStoryboard, "physical contract test needs a storyboard plan");
  const imagePromptWithPhysicalHint = buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: physicalStoryboard,
    productName: "Аэрогриль",
    productPhysicalContract: physicalContract,
    avatarReferenceUrl: "https://example.com/avatar.png",
    productReferenceUrls: ["https://example.com/air-fryer.png"],
  });
  assert.ok(!imagePromptWithPhysicalHint.includes("PRODUCT PHYSICAL CONTRACT:"), "GPT Image prompt must not receive provider contract heading");
  assert.ok(imagePromptWithPhysicalHint.includes("PRODUCT APPEARANCE ONLY:"), "GPT Image prompt should receive only a compact visual physical hint");

  const frameGatedStoryboard = {
    ...physicalStoryboard,
    frames: physicalStoryboard.frames.map((frame, index) => ({
      ...frame,
      spokenText: index === 1 ? "Аэрогриль в этой реплике" : frame.spokenText,
      productPlacement: index === 1 ? "аэрогриль стоит на столешнице без людей и рук" : "продукт вне кадра",
    })),
  };
  const frameGatedImagePrompt = buildStoryboardImagePrompt({
    segmentIndex: 1,
    storyboard: frameGatedStoryboard,
    productName: "Аэрогриль",
    avatarReferenceUrl: "https://example.com/avatar.png",
    productReferenceUrls: ["https://example.com/air-fryer.png"],
  });
  assert.ok(frameGatedImagePrompt.includes("впервые появляется только в панели 2"));
  assert.ok(frameGatedImagePrompt.includes("продукт в этом кадре не показывай"));
  const digitalImagePrompt = buildStoryboardImagePrompt({
    segmentIndex: 1, productName: "Планер", productRole: "digital_demo",
    storyboard: { ...frameGatedStoryboard, frames: frameGatedStoryboard.frames.map((frame, index) => ({
      ...frame, productPlacement: index === 1 ? "Планер открыт на экране одного смартфона" : "продукт вне кадра",
    })) },
    avatarReferenceUrl: "https://example.com/avatar.png", productReferenceUrls: ["https://example.com/product-screen.png"],
  });
  assert.match(digitalImagePrompt.split("\n").find((line) => line.includes("product reference images:")), /утверждённый экран на смартфоне/u);

  assert.equal(normalizedCount(prompts[0].prompt, prompts[1].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[0].voiceoverText), 0);
  assert.equal(normalizedCount(prompts[1].prompt, prompts[2].voiceoverText), 0);
  assert.equal(
    extractDirectorReferenceVideoUrl({
      director_video_url: "https://cdn.example.com/reference.mp4",
      product_refs: [{ url: "https://cdn.example.com/product.png" }],
    }),
    "https://cdn.example.com/reference.mp4"
  );
  assert.equal(
    extractDirectorReferenceVideoUrl({
      original_reels_url: "https://www.instagram.com/reels/DWgvjUfkeCO",
      stored_video_url: "https://cdn.example.com/stored-reference.mp4",
    }),
    "https://cdn.example.com/stored-reference.mp4",
    "Instagram page URLs must not be treated as downloadable reference videos"
  );
  assert.equal(
    extractDirectorReferenceVideoUrl({ reels_url: "https://www.instagram.com/reels/DWgvjUfkeCO" }),
    null,
    "plain Instagram pages must fall back instead of being passed to ffmpeg"
  );
  assert.equal(
    extractDirectorReferenceVideoUrl({ product_refs: [{ url: "https://cdn.example.com/product.png" }] }),
    null
  );
  assert.equal(frameTiming.STORYBOARD_REFERENCE_FRAMES_PER_SEGMENT, 2);
  const referenceSegments = [
    { index: 1, durationSeconds: 10 },
    { index: 2, durationSeconds: 10 },
    { index: 3, durationSeconds: 10 },
  ];
  const firstSegmentSeeks = frameTiming.buildSegmentReferenceSeekSeconds({
    segment: referenceSegments[0],
    segments: referenceSegments,
    sourceDurationSeconds: 90,
  });
  const secondSegmentSeeks = frameTiming.buildSegmentReferenceSeekSeconds({
    segment: referenceSegments[1],
    segments: referenceSegments,
    sourceDurationSeconds: 90,
  });
  assert.equal(firstSegmentSeeks.length, 2);
  assert.equal(secondSegmentSeeks.length, 2);
  assert.ok(firstSegmentSeeks.every((seek) => seek > 0 && seek < 30), "first segment seeks must stay in first source range");
  assert.ok(secondSegmentSeeks.every((seek) => seek > 30 && seek < 60), "second segment seeks must stay in second source range");
  assert.equal(frameTiming.readSourceDurationSeconds({ source_snapshot: { duration_seconds: 147 } }), 147);

  const storedInput = buildStoredPromptInput();
  const storedPrompts = buildOmniSegmentPrompts(storedInput);
  const storedSegments = storedInput.generatedScript.source_snapshot.llm_prompt_chain.providerPromptPlan.segmentPrompts;
  assert.equal(storedPrompts.length, storedSegments.length);
  storedPrompts.forEach((item, index) => {
    assert.notEqual(item.prompt, storedSegments[index].prompt);
    assert.ok(item.prompt.includes("Динамичный разговорный ролик"));
    assert.equal(
      item.prompt.includes("@product_file"),
      item.creativePlan.productRole !== "hidden",
      JSON.stringify({ index: item.index, role: item.creativePlan.productRole, placements: item.storyboardPlan.frames.map((frame) => frame.productPlacement) })
    );
    if (item.creativePlan.productRole !== "hidden") {
      assert.ok(item.storyboardPlan.frames.some((frame) => /аэрогрил/iu.test(frame.productPlacement)));
    }
    assert.equal(normalizedCount(item.prompt, item.voiceoverText), 1);
    assert.equal(item.voiceoverText, storedSegments[index].voiceover);
    assert.equal(item.storyboardPlan.frames.length, item.durationSeconds / 2);
    assert.ok(!item.prompt.includes("PRODUCT ACTION:"), "stored LLM prompt path must not inject product action blocks");
    assert.ok(!item.prompt.includes("SCENE ACTION:"), "stored LLM prompt path must not inject scene action blocks");
    assert.ok(!item.prompt.includes("REFERENCE SEGMENT CONTRACT"), "stored LLM prompt path must not inject the verbose reference plan");
    assert.ok(!item.prompt.includes("SOURCE INTERVAL OVERRIDE"), "stored LLM prompt path must not inject per-frame source overrides");
    assert.ok(item.prompt.includes("CONTINUITY:"), "stored LLM prompt path must keep the compact segment boundary contract");
  });

  const legacyStoredInput = buildStoredPromptInput({ omitStoryboardFrames: true });
  assert.throws(
    () => buildOmniSegmentPrompts(legacyStoredInput),
    /storyboard|frames|Раскадров/iu,
    "stored LLM prompt path must reject snapshots without storyboard frames"
  );

  console.log("Speech prompt sizes:", sizes);
  for (const size of sizes) assert.ok(size.chars < size.max, size.kind + " segment " + size.index + ": " + size.chars + " chars exceed " + size.max);
  console.log("Omni prompt speech contract regression checks passed");
} finally {
  global.fetch = originalFetch;
  rmSync(output, { recursive: true, force: true });
}

function buildInput() {
  const voiceSegments = [
    "Раньше ужин отнимал время. Аэрогриль готовит без масла. Теперь вечера стали спокойнее.",
    "После работы хочется отдыха. Аэрогриль помогает приготовить ужин. Остальное время остаётся семье.",
    "Я спокойно сравнил варианты. Этот аэрогриль стоит дома. Артикул указан в описании.",
  ];
  return {
    generatedScript: {
      id: 71,
      project_id: 7,
      product_id: 10,
      script: voiceSegments.join(" "),
      source_snapshot: {
        generated_script_plan: {
          hook_options: ["Аэрогриль без лишнего масла"],
          selected_hook: "Аэрогриль без лишнего масла",
          beats: [
            {
              stage: "hook",
              visual_cue: "Герой говорит на кухне; аэрогриль виден только в отдельной товарной вставке.",
              voiceover: voiceSegments[0],
            },
            {
              stage: "body",
              visual_cue: "Аэрогриль стоит на кухонной поверхности без людей и рук.",
              voiceover: voiceSegments[1],
            },
            {
              stage: "cta",
              visual_cue: "Возврат к лицу на той же кухне, фон не меняется.",
              voiceover: voiceSegments[2],
            },
          ],
        },
      },
    },
    legacyTranscript: null,
    product: {
      id: 10,
      project_id: 7,
      name: "Аэрогриль",
      description: "Кухонный аэрогриль для приготовления блюд без лишнего жира",
      product_reference_notes: "Черный настольный аэрогриль на кухонной поверхности.",
      product_refs: [{
        id: "air-fryer",
        url: "https://example.com/air-fryer.png",
        kind: "image",
        role: "product_primary",
        is_primary: true,
      }],
      avatar_refs: [],
      cta_mode: "article_in_description",
      cta_value: null,
    },
    avatar: {
      id: 3,
      project_id: 7,
      display_name: "Елисей",
      speech_gender: "male",
      prompt: "Мужчина в домашнем кухонном образе.",
      reference_url: "https://example.com/avatar.png",
      status: "approved",
      provider: "kie-omni",
      kie_character_id: "char_air",
      kie_character_status: "completed",
      kie_character_payload: null,
      is_active: true,
      created_at: "2026-07-22T00:00:00.000Z",
      updated_at: "2026-07-22T00:00:00.000Z",
    },
    segmentCount: 3,
    segmentSeconds: 6,
    voiceSegments: voiceSegments.map((text, index) => ({
      index: index + 1,
      text,
      wordCount: text.split(/\s+/u).filter(Boolean).length,
    })),
    segmentDurationsSeconds: [6, 6, 6],
    brief: null,
    targetAudience: "люди, которые готовят дома",
    ctaMode: "article_in_description",
    ctaValue: null,
    recentFormatIds: [],
  };
}

function buildStoredPromptInput(options = {}) {
  const input = buildInput();
  const voiceSegments = input.voiceSegments.map((segment) => segment.text);
  input.generatedScript.source_snapshot.llm_prompt_chain = {
    providerPromptPlan: {
      version: "llm-prompt-chain-v1",
      format: "talking_head_cutaways",
      segmentPrompts: voiceSegments.map((voiceover, index) => ({
        index: index + 1,
        durationSeconds: 6,
        voiceover,
        storyboardFrames: options.omitStoryboardFrames ? [] : makeStoredStoryboardFrames(voiceover),
        referenceRole: "avatar",
        prompt: [
          "Вертикальное живое видео на кухне.",
          "Миша начинает с лица в камеру и говорит энергично.",
          "В середине короткая перебивка на аэрогриль на столе без рук.",
          "Затем возврат к лицу в той же кухне.",
          "Свою музыку не добавляй.",
          `Речь звучит точно: ${voiceover}`,
        ].join(" "),
      })),
      notes: "Готовые промпты написаны LLM.",
    },
  };
  return input;
}

function makeStoredStoryboardFrames(voiceover) {
  const words = voiceover.split(/\s+/u).filter(Boolean);
  return [0, 1, 2].map((index) => ({
    index: index + 1,
    role: index === 1 ? "product_cutaway" : index === 0 ? "face_open" : "face_return",
    spokenWords: words.slice(index * 4, index * 4 + 4).join(" "),
    visualDescription: "кухня с деревянной столешницей и мягким светом",
    camera: index === 1 ? "крупный предметный ракурс" : "средний план на уровне глаз",
    action: index === 1 ? "аэрогриль стоит неподвижно на столешнице без людей и рук" : "аватар говорит в объектив со свободными руками",
    productState: index === 1 ? "аэрогриль стоит на устойчивой столешнице" : "продукт вне кадра",
    sfx: "тихие звуки кухни", referenceRole: index === 1 ? "product" : "avatar",
  }));
}

function normalizedCount(haystack, needle) {
  const normalizedHaystack = normalize(haystack);
  const normalizedNeedle = normalize(needle);
  return normalizedNeedle ? normalizedHaystack.split(normalizedNeedle).length - 1 : 0;
}

function normalize(value) {
  return String(value).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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
