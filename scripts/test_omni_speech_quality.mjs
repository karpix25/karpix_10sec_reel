import assert from "node:assert/strict";
import { assessOmniSpeechQuality } from "../ui/src/lib/server/omni/omni-speech-quality.ts";

assert.equal(
  assessOmniSpeechQuality(
    "Визу можно получить полностью удаленно. Одобрение по ней высокое.",
    "Визу можно получить полностью удаленно, отдаленно. Одобрение по ней высокое."
  ).passed,
  false
);

assert.equal(
  assessOmniSpeechQuality(
    "Плати по миру виртуальная карта.",
    "Плати по миру виртуальная карта."
  ).passed,
  true
);
