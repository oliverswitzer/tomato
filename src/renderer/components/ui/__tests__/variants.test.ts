import { describe, it, expect } from 'vitest';
import {
  buttonClasses,
  iconButtonClasses,
  cardClasses,
  badgeClasses,
  badgeDotClass,
  progressTrackClasses,
  clampPercent,
} from '../variants';

describe('ui/variants', () => {
  it('buttonClasses includes variant and size specific classes', () => {
    const primary = buttonClasses('primary', 'md');
    expect(primary).toContain('bg-accent');
    expect(primary).toContain('px-4');

    const secondarySm = buttonClasses('secondary', 'sm');
    expect(secondarySm).toContain('bg-cream');
    expect(secondarySm).toContain('px-3');

    const danger = buttonClasses('danger');
    expect(danger).toContain('text-accent');
  });

  it('buttonClasses appends caller className without dropping base classes', () => {
    const result = buttonClasses('primary', 'md', 'w-full');
    expect(result).toContain('w-full');
    expect(result).toContain('rounded-xl');
  });

  it('iconButtonClasses varies by size', () => {
    expect(iconButtonClasses('sm')).toContain('w-7');
    expect(iconButtonClasses('md')).toContain('w-9');
  });

  it('cardClasses returns base card styling and merges custom class', () => {
    const result = cardClasses('mt-4');
    expect(result).toContain('rounded-2xl');
    expect(result).toContain('mt-4');
  });

  it('badgeClasses + badgeDotClass share the same semantic color per variant', () => {
    expect(badgeClasses('success')).toContain('text-[#2E7D32]');
    expect(badgeDotClass('success')).toContain('bg-[#2E7D32]');

    expect(badgeClasses('accent')).toContain('bg-accent/10');
    expect(badgeDotClass('accent')).toContain('bg-accent');
  });

  it('progressTrackClasses merges custom class', () => {
    expect(progressTrackClasses('mb-2')).toContain('mb-2');
    expect(progressTrackClasses()).toContain('h-1');
  });

  it('clampPercent clamps to [0, 100] and handles NaN', () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(NaN)).toBe(0);
  });
});
