export type ProductVisualProfile = {
  physical_form: string;
  package_type: string;
  colors: string[];
  materials_finish: string[];
  size_proportions: string;
  labels_text_logo_placement: string;
  cap_closure_seal: string;
  texture: string;
  must_preserve: string[];
  must_not_change: string[];
  prompt_summary: string;
};

export function normalizeProductVisualProfile(value: unknown): ProductVisualProfile | null {
  const candidate = unwrapProductVisualProfile(value);
  if (!isRecord(candidate)) return null;

  const profile: ProductVisualProfile = {
    physical_form: stringValue(candidate.physical_form ?? candidate.form ?? candidate.shape),
    package_type: stringValue(candidate.package_type ?? candidate.packaging_type ?? candidate.packaging),
    colors: stringArray(candidate.colors ?? candidate.color_palette ?? candidate.colours),
    materials_finish: stringArray(candidate.materials_finish ?? candidate.materials ?? candidate.finish),
    size_proportions: stringValue(candidate.size_proportions ?? candidate.size ?? candidate.proportions),
    labels_text_logo_placement: stringValue(
      candidate.labels_text_logo_placement ??
        candidate.label_text_logo_placement ??
        candidate.labels_logo_placement ??
        candidate.labeling
    ),
    cap_closure_seal: stringValue(candidate.cap_closure_seal ?? candidate.closure ?? candidate.cap),
    texture: stringValue(candidate.texture ?? candidate.surface_texture),
    must_preserve: stringArray(candidate.must_preserve ?? candidate.preserve),
    must_not_change: stringArray(candidate.must_not_change ?? candidate.do_not_change ?? candidate.avoid_changes),
    prompt_summary: stringValue(candidate.prompt_summary ?? candidate.summary ?? candidate.prompt_contract),
  };

  if (!profile.prompt_summary) profile.prompt_summary = buildPromptSummary(profile);
  return hasEnoughProductDetail(profile) ? profile : null;
}

export function extractProductVisualProfileFromSnapshot(snapshot: unknown): ProductVisualProfile | null {
  if (!isRecord(snapshot)) return null;
  return normalizeProductVisualProfile(
    snapshot.product_visual_profile ??
      snapshot.product_visual_passport ??
      snapshot.visual_profile ??
      snapshot.product_reference_analysis
  );
}

export function buildProductVisualProfileFromText(input: {
  description?: string | null;
  notes?: string | null;
}): ProductVisualProfile | null {
  const source = [input.description, input.notes].map((value) => stringValue(value)).filter(Boolean).join(" ");
  if (!source) return null;
  return {
    physical_form: "",
    package_type: "",
    colors: [],
    materials_finish: [],
    size_proportions: "",
    labels_text_logo_placement: "",
    cap_closure_seal: "",
    texture: "",
    must_preserve: [source],
    must_not_change: ["Do not invent a different package, colorway, label layout, size, material, or closure."],
    prompt_summary: source,
  };
}

export function renderProductVisualProfileForPrompt(profile: ProductVisualProfile | null) {
  if (!profile) return "";
  return [
    "PRODUCT VISUAL PASSPORT:",
    profile.physical_form ? `- Physical form: ${profile.physical_form}.` : "",
    profile.package_type ? `- Packaging type: ${profile.package_type}.` : "",
    profile.colors.length ? `- Exact visible colors: ${profile.colors.join(", ")}.` : "",
    profile.materials_finish.length ? `- Materials and finish: ${profile.materials_finish.join(", ")}.` : "",
    profile.size_proportions ? `- Size and proportions: ${profile.size_proportions}.` : "",
    profile.labels_text_logo_placement ? `- Label, text, and logo placement: ${profile.labels_text_logo_placement}.` : "",
    profile.cap_closure_seal ? `- Cap, closure, or seal: ${profile.cap_closure_seal}.` : "",
    profile.texture ? `- Surface texture: ${profile.texture}.` : "",
    profile.must_preserve.length ? `- Must preserve: ${profile.must_preserve.join("; ")}.` : "",
    profile.must_not_change.length ? `- Must not change: ${profile.must_not_change.join("; ")}.` : "",
    profile.prompt_summary ? `- Prompt summary: ${profile.prompt_summary}.` : "",
    "- Treat the supplied product reference image and this product passport as the exact source of truth whenever the product appears.",
    "- Do not alter package type, silhouette, cap or lid color, label layout, visible color palette, material finish, size proportions, text/logo placement, or closure details.",
    "- Do not invent a different container, extra labels, alternate flavor artwork, unrelated props attached to the package, or a replacement product.",
  ].filter(Boolean).join("\n");
}

export function renderProductPhysicalityContract(profile: ProductVisualProfile | null) {
  if (!profile) return "";
  return [
    "PRODUCT PHYSICALITY:",
    "- Show the product as a real object in the room: it casts contact shadows, touches the table or hand, and never appears from nowhere.",
    "- When held, fingers may partially occlude the package; when rotated, perspective, label angle, shadows, and highlights move together.",
    "- Keep material finish tactile and imperfect: small crinkles, surface texture, edge thickness, and reflections match the product passport.",
  ].join("\n");
}

export function renderProductVisualProfileSummary(profile: ProductVisualProfile | null) {
  if (!profile) return "";
  return profile.prompt_summary || buildPromptSummary(profile);
}

function unwrapProductVisualProfile(value: unknown) {
  if (!isRecord(value)) return value;
  return value.product_visual_profile || value.product_visual_passport || value.visual_profile || value;
}

function buildPromptSummary(profile: ProductVisualProfile) {
  return [
    profile.physical_form,
    profile.package_type,
    profile.colors.length ? `colors: ${profile.colors.join(", ")}` : "",
    profile.materials_finish.length ? `materials/finish: ${profile.materials_finish.join(", ")}` : "",
    profile.size_proportions,
    profile.labels_text_logo_placement,
    profile.cap_closure_seal,
    profile.texture,
  ].filter(Boolean).join("; ");
}

function hasEnoughProductDetail(profile: ProductVisualProfile) {
  const textFields = [
    profile.physical_form,
    profile.package_type,
    profile.size_proportions,
    profile.labels_text_logo_placement,
    profile.cap_closure_seal,
    profile.texture,
    profile.prompt_summary,
  ].filter(Boolean).length;
  return textFields + profile.colors.length + profile.materials_finish.length + profile.must_preserve.length >= 2;
}

function stringArray(value: unknown) {
  if (typeof value === "string") {
    const normalized = stringValue(value);
    return normalized ? [normalized] : [];
  }
  if (!Array.isArray(value)) return [];
  return value.map((item) => stringValue(item)).filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
