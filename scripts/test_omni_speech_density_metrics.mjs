import assert from "node:assert/strict";
import { analyzeSpeechDensity, normalizeTranscriptWords, summarizeNumericValues, summarizeResults } from "../ui/scripts/omni-speech-density-metrics.mjs";

const words = normalizeTranscriptWords([
  { word: "раз", start: 0.1, end: 0.35, confidence: 0.99 },
  { word: "два", start: 0.6, end: 0.9, confidence: 0.98 },
  { word: "три", start: 1.3, end: 1.7, confidence: 0.97 },
  { word: "четыре", start: 1.9, end: 2.2, confidence: 0.96 },
  { word: "пять", start: 2.5, end: 2.8, confidence: 0.95 },
]);
const metrics = analyzeSpeechDensity({
  durationSeconds: 4,
  expectedVoiceover: "раз два три четыре пять",
  words,
  frameSeconds: 2,
});

assert.deepEqual(metrics.frameMetrics.map((frame) => frame.completeWordCount), [3, 1]);
assert.deepEqual(metrics.frameMetrics.map((frame) => frame.startedWordCount), [4, 1]);
assert.equal(metrics.crossingWordCount, 1);
assert.deepEqual(metrics.wordTimings.map((word) => [word.word, word.start, word.end]), [
  ["раз", 0.1, 0.35],
  ["два", 0.6, 0.9],
  ["три", 1.3, 1.7],
  ["четыре", 1.9, 2.2],
  ["пять", 2.5, 2.8],
]);
assert.equal(metrics.transcriptMatch.matchRatio, 1);
assert.equal(metrics.completeWordsPerFrame.mean, 2);
assert.equal(summarizeNumericValues([3, 1, 5]).median, 3);
assert.equal(summarizeResults([{ actualDurationSeconds: 4, metrics }]).videoCount, 1);
console.log("Omni speech density metric checks passed");
