import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { VaultStore } from '../vault-store';
import type { VaultItem } from '../../shared/ipc';

function makeItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    sessionIntention: 'Build the focus tracker',
    ideaSummary: 'Exploring real-time screen capture APIs for productivity tracking.',
    driftReason: 'User switched to YouTube.',
    classification: 'Off-task',
    apps: ['Chrome', 'YouTube'],
    urls: ['https://youtube.com/watch?v=abc'],
    windowTitles: ['YouTube - How to build a CLI'],
    screenText: 'Some screen text captured',
    rawBatchSummary: 'Watched a YouTube video about CLI tools.',
    ...overrides,
  };
}

describe('VaultStore', () => {
  let tmpDir: string;
  let store: VaultStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
    store = new VaultStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and retrieves items (newest first)', () => {
    const item1 = makeItem({ id: 'a', savedAt: '2026-01-01T00:00:00Z' });
    const item2 = makeItem({ id: 'b', savedAt: '2026-01-02T00:00:00Z' });

    store.save(item1);
    store.save(item2);

    const items = store.getItems();
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('b');
    expect(items[1].id).toBe('a');
  });

  it('caps at 100 items, evicting oldest', () => {
    for (let i = 0; i < 105; i++) {
      store.save(makeItem({ id: `item-${i}` }));
    }

    const items = store.getItems();
    expect(items).toHaveLength(100);
    expect(items.find((i) => i.id === 'item-0')).toBeUndefined();
    expect(items.find((i) => i.id === 'item-4')).toBeUndefined();
    expect(items.find((i) => i.id === 'item-5')).toBeDefined();
    expect(items.find((i) => i.id === 'item-104')).toBeDefined();
  });

  it('deletes item by id', () => {
    store.save(makeItem({ id: 'keep' }));
    store.save(makeItem({ id: 'remove' }));

    store.delete('remove');

    const items = store.getItems();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('keep');
  });

  it('delete is a no-op for nonexistent id', () => {
    store.save(makeItem({ id: 'a' }));
    store.delete('nonexistent');

    expect(store.getItems()).toHaveLength(1);
  });

  it('returns empty array when file does not exist', () => {
    expect(store.getItems()).toEqual([]);
  });

  it('returns empty array when file contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'vault.json'), 'not json!!!');
    expect(store.getItems()).toEqual([]);
  });

  it('returns empty array when file contains non-array JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'vault.json'), '{"foo": "bar"}');
    expect(store.getItems()).toEqual([]);
  });
});
