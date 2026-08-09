import assert from "node:assert/strict";
import { normalizeStoryboardVisionValidation } from "../src/lib/server/omni/storyboard-vision-contract";

const passingPanels = [1, 2, 3, 4].map((panelIndex) => ({
  panel_index: panelIndex,
  status: "pass",
  violations: [],
}));

assert.equal(normalizeStoryboardVisionValidation({
  status: "block",
  confidence: 0.92,
  panels: passingPanels,
  repair_instructions: [],
}).status, "pass");

assert.equal(normalizeStoryboardVisionValidation({
  status: "block",
  confidence: 0.92,
  panels: passingPanels,
  repair_instructions: ["Replace the background"],
}).status, "repair");

assert.equal(normalizeStoryboardVisionValidation({
  status: "pass",
  confidence: 0.92,
  panels: [{ panel_index: 1, status: "block", violations: [] }],
  repair_instructions: [],
}).status, "block");

assert.equal(normalizeStoryboardVisionValidation({
  status: "pass",
  confidence: 0.5,
  panels: passingPanels,
  repair_instructions: [],
}).status, "block");

assert.equal(normalizeStoryboardVisionValidation({
  status: "repair",
  confidence: 0.9,
  panels: [...passingPanels.slice(0, 3), { panel_index: 4, status: "repair", violations: [] }],
  repair_instructions: [],
}).status, "pass");

console.log("storyboard vision contract smoke: ok");
