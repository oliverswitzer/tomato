import { describe, it, expect } from 'vitest';
import { POSTHOG_PROJECT_TOKEN, POSTHOG_HOST } from '../analytics';

describe('PostHog configuration', () => {
  it('ships a non-empty project token, so a release build actually sends', () => {
    expect(POSTHOG_PROJECT_TOKEN).not.toBe('');
  });

  it('ships a project token, never a personal API key', () => {
    // phc_ is the public, write-only project key and is safe to commit.
    // phx_ is a personal API key with read access and must never land in the repo.
    expect(POSTHOG_PROJECT_TOKEN).toMatch(/^phc_[A-Za-z0-9]{40,}$/);
    expect(POSTHOG_PROJECT_TOKEN).not.toMatch(/^phx_/);
  });

  it('points at the US region, which is where this project lives', () => {
    expect(POSTHOG_HOST).toBe('https://us.i.posthog.com');
  });
});
