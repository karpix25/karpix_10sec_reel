const BADY_AVATAR_PROMPT = ["европейская", "Девушка средних лет", "в домашней обстановке"].join("\n");

function normalizeBrandName(name: string | null | undefined) {
  return (name || "").trim().toLowerCase();
}

export function getDefaultAvatarPrompt(brandName: string | null | undefined) {
  const normalized = normalizeBrandName(brandName);
  if (normalized.includes("бады")) return BADY_AVATAR_PROMPT;
  return "";
}

