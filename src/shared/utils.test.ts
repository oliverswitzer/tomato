import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatTime, relativeDate, formatActivityTime } from './utils';

describe('formatTime', () => {
  it('formats zero seconds', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  it('formats seconds only', () => {
    expect(formatTime(45)).toBe('00:45');
  });

  it('formats minutes and seconds', () => {
    expect(formatTime(125)).toBe('02:05');
  });

  it('formats exact minutes', () => {
    expect(formatTime(1500)).toBe('25:00');
  });

  it('formats large values', () => {
    expect(formatTime(3600)).toBe('60:00');
  });
});

describe('relativeDate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows minutes for recent times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:30:00Z'));
    expect(relativeDate('2026-01-01T12:10:00Z')).toBe('20 min ago');
  });

  it('shows hours for same-day times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T15:00:00Z'));
    expect(relativeDate('2026-01-01T12:00:00Z')).toBe('3h ago');
  });

  it('shows yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T12:00:00Z'));
    expect(relativeDate('2026-01-01T12:00:00Z')).toBe('yesterday');
  });

  it('shows days for recent past', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));
    expect(relativeDate('2026-01-01T12:00:00Z')).toBe('4 days ago');
  });
});

describe('formatActivityTime', () => {
  it('formats a timestamp to time string', () => {
    const result = formatActivityTime('2026-01-01T14:30:00Z');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});
