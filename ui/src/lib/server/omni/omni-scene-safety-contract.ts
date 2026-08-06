export const OMNI_NO_VISIBLE_FILMING_GEAR_PROMPT =
  "CLEAN SET: filming equipment is never visible in the generated scene. No tripod, camera stand, selfie stick, light stand, boom mic, cables, crew, rig, reflector, production monitor, or random production object may appear in frame. Stable camera means the support is off-camera and invisible. Do not invent unrelated props, appliances, tools, furniture, or background objects that are not required by the reference scene, product placement, or spoken script.";

export const OMNI_REFERENCE_PRODUCT_EXCLUSION_PROMPT =
  "REFERENCE PRODUCT EXCLUSION: the only product allowed in the generated scene is the supplied product reference. Remove every original-reference product, brand, package, label, food item, supplement, cosmetic, or other commercial object; never copy its appearance, name, logo, or physical presence. If the reference action uses a foreign product, replace that action with the supplied product or a neutral presenter gesture.";

const FILMING_SUPPORT_PATTERN =
  /tripod|gimbal|fixed\s+mount|camera\s+stand|selfie\s+stick|light\s+stand|rig|штатив|стедикам|стабилизатор|стойк[аи]\s+света|камера\s+на\s+стойк/iu;

export function sanitizeCameraStabilizationForPrompt(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (!FILMING_SUPPORT_PATTERN.test(normalized)) return normalized;
  return "stable locked-off camera framing with a natural smartphone perspective; all filming support stays off-camera and invisible";
}
