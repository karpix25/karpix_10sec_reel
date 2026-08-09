import assert from "node:assert/strict";
import { appendKieReferenceOrderPrompt } from "../src/lib/server/omni/omni-continuity-prompt";
import {
  applyOmniStoryboardFileReference,
  getOmniImageReferenceTag,
} from "../src/lib/server/omni/storyboard/omni-storyboard-file-reference";

const images = [{ role: "storyboard" }, { role: "product" }];
const prompt = applyOmniStoryboardFileReference(
  "Board @storyboard_file. Product @product_file.",
  images
);
const providerPrompt = appendKieReferenceOrderPrompt(prompt, images);

assert.equal(getOmniImageReferenceTag(0), "<IMAGE_REF_0>");
assert.match(providerPrompt, /\[# References\n<IMAGE_REF_0>@Image1\n<IMAGE_REF_1>@Image2\n\]/u);
assert.match(providerPrompt, /Board <IMAGE_REF_0>\. Product <IMAGE_REF_1>\./u);
assert.doesNotMatch(providerPrompt, /@file\d+/u);
assert.ok(providerPrompt.indexOf("[# References") < providerPrompt.indexOf("Board <IMAGE_REF_0>"));
assert.doesNotMatch(
  appendKieReferenceOrderPrompt("Product only.", [{ role: "product" }]),
  /ordered instruction board/u
);

console.log("omni-reference-contract-smoke: ok");
