type RoundRobinCandidate = {
  id: number;
  client_id: number | null;
};

export function selectRoundRobinCandidate<T extends RoundRobinCandidate>(
  candidates: readonly T[],
  lastSelectedId: number | null,
  excludedIds: readonly number[] = [],
) {
  const ordered = [...candidates].sort(
    (left, right) => (left.client_id ?? Number.MAX_SAFE_INTEGER) - (right.client_id ?? Number.MAX_SAFE_INTEGER) || left.id - right.id,
  );
  const excluded = new Set(excludedIds);
  const available = ordered.filter((candidate) => !excluded.has(candidate.id));
  if (!available.length) return null;

  const lastIndex = ordered.findIndex((candidate) => candidate.id === lastSelectedId);
  if (lastIndex < 0) return available[0];

  for (let offset = 1; offset <= ordered.length; offset += 1) {
    const candidate = ordered[(lastIndex + offset) % ordered.length];
    if (!excluded.has(candidate.id)) return candidate;
  }
  return null;
}
