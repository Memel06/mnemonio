import { describe, it, expect } from 'vitest';
import { memoryAge, memoryFreshnessText } from './memoryAge.js';

const DAY_MS = 86_400_000;

describe('memoryAge', () => {
  const now = Date.now();

  it('classifies sub-day as fresh', () => {
    const result = memoryAge(now - 3_600_000, now);
    expect(result.freshness).toBe('fresh');
    expect(result.ageDays).toBeLessThan(1);
  });

  it('classifies 3 days as recent', () => {
    const result = memoryAge(now - 3 * DAY_MS, now);
    expect(result.freshness).toBe('recent');
  });

  it('classifies 14 days as aging', () => {
    const result = memoryAge(now - 14 * DAY_MS, now);
    expect(result.freshness).toBe('aging');
  });

  it('classifies 60 days as stale', () => {
    const result = memoryAge(now - 60 * DAY_MS, now);
    expect(result.freshness).toBe('stale');
  });

  it('clamps negative age to 0', () => {
    const result = memoryAge(now + DAY_MS, now);
    expect(result.ageMs).toBe(0);
  });
});

describe('memoryFreshnessText', () => {
  const now = Date.now();

  it('returns "just now" for very recent', () => {
    expect(memoryFreshnessText(now - 60_000, now)).toBe('just now');
  });

  it('returns hours for sub-day', () => {
    expect(memoryFreshnessText(now - 5 * 3_600_000, now)).toBe('5h ago');
  });

  it('returns days for sub-week', () => {
    expect(memoryFreshnessText(now - 3 * DAY_MS, now)).toBe('3d ago');
  });

  it('returns weeks for sub-month', () => {
    expect(memoryFreshnessText(now - 14 * DAY_MS, now)).toBe('2w ago');
  });

  it('returns months for sub-year', () => {
    expect(memoryFreshnessText(now - 90 * DAY_MS, now)).toBe('3mo ago');
  });

  it('returns years for old memories', () => {
    expect(memoryFreshnessText(now - 400 * DAY_MS, now)).toBe('1y ago');
  });
});
