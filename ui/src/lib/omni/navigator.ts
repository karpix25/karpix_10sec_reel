export function buildManualProductRefs(referenceUrl: string) {
  const url = referenceUrl.trim();
  if (!url) return [];

  return [
    {
      id: url,
      url,
      kind: "image",
      role: "product_primary",
      label: "product reference",
      storage_provider: "manual",
      status: "manual_url",
      is_primary: true,
    },
  ];
}
