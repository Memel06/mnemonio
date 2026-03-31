interface AgeResult {
  readonly ageMs: number;
  readonly ageDays: number;
  readonly freshness: 'fresh' | 'recent' | 'aging' | 'stale';
}

const DAY_MS = 86_400_000;

export function memoryAge(
  mtimeMs: number,
  now: number = Date.now(),
): AgeResult {
  const ageMs = Math.max(0, now - mtimeMs);
  const ageDays = ageMs / DAY_MS;

  let freshness: AgeResult['freshness'];
  if (ageDays < 1) {
    freshness = 'fresh';
  } else if (ageDays < 7) {
    freshness = 'recent';
  } else if (ageDays < 30) {
    freshness = 'aging';
  } else {
    freshness = 'stale';
  }

  return { ageMs, ageDays, freshness };
}

export function memoryFreshnessText(
  mtimeMs: number,
  now: number = Date.now(),
): string {
  const { ageDays } = memoryAge(mtimeMs, now);

  if (ageDays < 1) {
    const hours = Math.floor(ageDays * 24);
    if (hours < 1) return 'just now';
    return `${hours}h ago`;
  }
  if (ageDays < 7) return `${Math.floor(ageDays)}d ago`;
  if (ageDays < 30) return `${Math.floor(ageDays / 7)}w ago`;
  if (ageDays < 365) return `${Math.floor(ageDays / 30)}mo ago`;
  return `${Math.floor(ageDays / 365)}y ago`;
}
