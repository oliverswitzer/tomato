import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

const mockSafeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn().mockReturnValue(true),
  encryptString: vi.fn((s: string) => Buffer.from(`encrypted:${s}`)),
  decryptString: vi.fn((buf: Buffer) => buf.toString().replace('encrypted:', '')),
}));

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
}));

import { ElectronKeychainStore } from '../keychain';

describe('ElectronKeychainStore', () => {
  let tmpDir: string;
  let store: ElectronKeychainStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keychain-test-'));
    store = new ElectronKeychainStore(tmpDir);
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
  });

  describe('skip state', () => {
    it('defaults to not skipped', () => {
      expect(store.wasSkipped()).toBe(false);
    });

    it('persists skip state', () => {
      store.setSkipped(true);
      expect(store.wasSkipped()).toBe(true);
    });

    it('can reset skip state', () => {
      store.setSkipped(true);
      store.setSkipped(false);
      expect(store.wasSkipped()).toBe(false);
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

    it('skip and model share the same JSON file without overwriting each other', () => {
      store.setSkipped(true);
      store.setSelectedModel('claude-3-haiku-20240307');
      expect(store.wasSkipped()).toBe(true);
      expect(store.getSelectedModel()).toBe('claude-3-haiku-20240307');
    });
  });

  describe('encryption unavailable', () => {
    it('throws when trying to save without encryption', () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValueOnce(false);

      expect(() => store.saveApiKey('sk-ant-test1234567890abcdef')).toThrow('Encryption not available');
    });

    it('returns null when trying to read without encryption', () => {
      store.saveApiKey('sk-ant-test1234567890abcdef');

      mockSafeStorage.isEncryptionAvailable.mockReturnValueOnce(false);

      expect(store.getApiKey()).toBeNull();
    });
  });
});
