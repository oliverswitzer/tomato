import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
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

describe('splash/index.html PostHog snippet', () => {
  // vitest runs from the repo root.
  const html = fs.readFileSync(path.join(process.cwd(), 'splash', 'index.html'), 'utf8');

  // The \b matters: it stops `host` from matching `api_host: cfg.host` in the init call below.
  function snippetValue(key: string): string {
    const match = html.match(new RegExp(`\\b${key}:\\s*'([^']*)'`));
    if (!match) throw new Error(`no ${key} found in the window.TOMATO_POSTHOG snippet`);
    return match[1];
  }

  it('declares the analytics config on window.TOMATO_POSTHOG', () => {
    expect(html).toContain('window.TOMATO_POSTHOG');
  });

  it('carries exactly the same project token as the app', () => {
    expect(snippetValue('token')).toBe(POSTHOG_PROJECT_TOKEN);
  });

  it('points at the same region as the app', () => {
    expect(snippetValue('host')).toBe(POSTHOG_HOST);
  });

  it('registers the environment as a super-property so $pageview is tagged too', () => {
    expect(html).toContain('posthog.register({ environment: cfg.environment })');
  });

  it('treats a local or preview host as development, not production', () => {
    expect(html).toContain("'tomatoapp.dev'");
    expect(html).toContain("'development'");
    expect(html).toContain("'production'");
  });

  it('keeps autocapture and session replay off', () => {
    expect(html).toContain('autocapture: false');
    expect(html).toContain('disable_session_recording: true');
  });
});
