import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { ElectronKeychainStore } from '../keychain';

describe('ElectronKeychainStore', () => {
  let tmpDir: string;
  let store: ElectronKeychainStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keychain-test-'));
    store = new ElectronKeychainStore(tmpDir, 'test-machine-id');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('API key', () => {
    it('round-trips an API key through save and get', () => {
      store.saveApiKey('sk-ant-test1234567890abcdef');
      expect(store.getApiKey()).toBe('sk-ant-test1234567890abcdef');
    });

    it('returns null when no key is saved', () => {
      expect(store.getApiKey()).toBeNull();
    });

    it('deletes a saved key', () => {
      store.saveApiKey('sk-ant-test1234567890abcdef');
      store.deleteApiKey();
      expect(store.getApiKey()).toBeNull();
    });

    it('delete is idempotent when no key exists', () => {
      expect(() => store.deleteApiKey()).not.toThrow();
    });

    it('returns null for corrupted data', () => {
      fs.writeFileSync(path.join(tmpDir, 'api-key.enc'), 'garbage');
      expect(store.getApiKey()).toBeNull();
    });

    it('cannot decrypt with a different machine id', () => {
      store.saveApiKey('sk-ant-test1234567890abcdef');
      const otherStore = new ElectronKeychainStore(tmpDir, 'different-machine');
      expect(otherStore.getApiKey()).toBeNull();
    });
  });

  describe('selected model', () => {
    it('defaults to null', () => {
      expect(store.getSelectedModel()).toBeNull();
    });

    it('persists selected model', () => {
      store.setSelectedModel('claude-haiku-4-5-20251001');
      expect(store.getSelectedModel()).toBe('claude-haiku-4-5-20251001');
    });
  });

  describe('analytics preference', () => {
    it('defaults to enabled', () => {
      expect(store.getAnalyticsEnabled()).toBe(true);
    });

    it('persists an opt-out', () => {
      store.setAnalyticsEnabled(false);
      expect(store.getAnalyticsEnabled()).toBe(false);
      expect(new ElectronKeychainStore(tmpDir, 'test-machine-id').getAnalyticsEnabled()).toBe(false);
    });

    it('persists an opt back in', () => {
      store.setAnalyticsEnabled(false);
      store.setAnalyticsEnabled(true);
      expect(store.getAnalyticsEnabled()).toBe(true);
    });

    it('does not disturb the selected model', () => {
      store.setSelectedModel('claude-haiku-4-5-20251001');
      store.setAnalyticsEnabled(false);
      expect(store.getSelectedModel()).toBe('claude-haiku-4-5-20251001');
    });
  });

  describe('first launch', () => {
    it('is true once and false afterwards', () => {
      expect(store.consumeFirstLaunch()).toBe(true);
      expect(store.consumeFirstLaunch()).toBe(false);
      expect(new ElectronKeychainStore(tmpDir, 'test-machine-id').consumeFirstLaunch()).toBe(false);
    });

    it('does not disturb the analytics preference', () => {
      store.setAnalyticsEnabled(false);
      store.consumeFirstLaunch();
      expect(store.getAnalyticsEnabled()).toBe(false);
    });
  });
});
