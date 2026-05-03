import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ModelDownloadManager, MODEL_FILENAME } from '../model-download-manager';

describe('ModelDownloadManager', () => {
  let tmpDir: string;
  let manager: ModelDownloadManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tomato-model-test-'));
    manager = new ModelDownloadManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports model does not exist initially', () => {
    expect(manager.modelExists()).toBe(false);
  });

  it('reports model exists when file is present', () => {
    fs.writeFileSync(path.join(tmpDir, MODEL_FILENAME), 'fake-model-data');
    expect(manager.modelExists()).toBe(true);
  });

  it('skips download when model already exists', async () => {
    const modelPath = path.join(tmpDir, MODEL_FILENAME);
    fs.writeFileSync(modelPath, 'fake-model-data');

    const result = await manager.download();
    expect(result).toBe(modelPath);
    expect(manager.getStatus().state).toBe('completed');
  });

  it('returns correct model path', () => {
    expect(manager.getModelPath()).toBe(path.join(tmpDir, MODEL_FILENAME));
  });

  it('initial status is idle', () => {
    expect(manager.getStatus().state).toBe('idle');
  });

  it('cleans up partial file on cancel', async () => {
    const partialPath = path.join(tmpDir, MODEL_FILENAME + '.partial');
    fs.writeFileSync(partialPath, 'partial-data');

    const downloadPromise = manager.download();
    manager.cancel();

    try {
      await downloadPromise;
    } catch {
      // expected
    }

    expect(fs.existsSync(partialPath)).toBe(false);
  });

  it('creates models directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'models');
    const mgr = new ModelDownloadManager(nestedDir);
    const modelPath = path.join(nestedDir, MODEL_FILENAME);
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.writeFileSync(modelPath, 'fake');

    const result = await mgr.download();
    expect(result).toBe(modelPath);
  });

  it('emits progress callback', async () => {
    fs.writeFileSync(path.join(tmpDir, MODEL_FILENAME), 'model');
    const statuses: string[] = [];
    manager.setProgressCallback((s) => statuses.push(s.state));

    await manager.download();
    expect(statuses).toContain('completed');
  });
});
