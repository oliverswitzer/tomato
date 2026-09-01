import { describe, it, expect } from 'vitest';
import { buildForegroundCommand, isValidAppName } from '../take-me-back';

describe('buildForegroundCommand', () => {
  it('builds an `open -a <app>` invocation for the given app name', () => {
    expect(buildForegroundCommand('Visual Studio Code')).toEqual({
      command: 'open',
      args: ['-a', 'Visual Studio Code'],
    });
  });

  it('passes through app names verbatim (no normalization/guessing)', () => {
    expect(buildForegroundCommand('Google Chrome')).toEqual({
      command: 'open',
      args: ['-a', 'Google Chrome'],
    });
  });
});

describe('isValidAppName', () => {
  it('rejects empty and whitespace-only names', () => {
    expect(isValidAppName('')).toBe(false);
    expect(isValidAppName('   ')).toBe(false);
  });

  it('accepts a real app name', () => {
    expect(isValidAppName('VS Code')).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(isValidAppName(undefined as unknown as string)).toBe(false);
    expect(isValidAppName(null as unknown as string)).toBe(false);
  });
});
