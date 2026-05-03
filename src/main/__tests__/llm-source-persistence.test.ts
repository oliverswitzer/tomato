import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ElectronKeychainStore } from '../keychain';

describe('ElectronKeychainStore LLM source persistence', () => {
  let tmpDir: string;
  let store: ElectronKeychainStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-keychain-test-'));
    store = new ElectronKeychainStore(tmpDir, 'test-machine-id');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no LLM source is set', () => {
    expect(store.getLlmSource()).toBeNull();
  });

  it('persists and retrieves "local" source', () => {
    store.setLlmSource('local');
    expect(store.getLlmSource()).toBe('local');
  });

  it('persists and retrieves "anthropic" source', () => {
    store.setLlmSource('anthropic');
    expect(store.getLlmSource()).toBe('anthropic');
  });

  it('switches source from local to anthropic', () => {
    store.setLlmSource('local');
    expect(store.getLlmSource()).toBe('local');

    store.setLlmSource('anthropic');
    expect(store.getLlmSource()).toBe('anthropic');
  });

  it('preserves existing onboarding data when setting LLM source', () => {
    store.setSelectedModel('claude-haiku-4-5');
    store.setLlmSource('anthropic');

    expect(store.getSelectedModel()).toBe('claude-haiku-4-5');
    expect(store.getLlmSource()).toBe('anthropic');
  });

  it('survives store re-instantiation', () => {
    store.setLlmSource('local');
    const store2 = new ElectronKeychainStore(tmpDir, 'test-machine-id');
    expect(store2.getLlmSource()).toBe('local');
  });
});
