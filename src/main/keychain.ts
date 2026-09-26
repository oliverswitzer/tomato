import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMachineId } from './machine-id';

const ENCRYPTION_SALT = 'com.tomato.pomodoro.v1';

interface KeychainStore {
  saveApiKey(key: string): void;
  getApiKey(): string | null;
  deleteApiKey(): void;
  setSelectedModel(model: string): void;
  getSelectedModel(): string | null;
  getAnalyticsEnabled(): boolean;
  setAnalyticsEnabled(enabled: boolean): void;
  consumeFirstLaunch(): boolean;
}

export class ElectronKeychainStore implements KeychainStore {
  private encryptionKey: Buffer;

  constructor(private storagePath: string, machineId?: string) {
    const id = machineId ?? getMachineId();
    this.encryptionKey = crypto.createHash('sha256')
      .update(ENCRYPTION_SALT + id)
      .digest();
  }

  saveApiKey(key: string): void {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const data = Buffer.concat([iv, authTag, encrypted]);
    fs.mkdirSync(path.dirname(this.keyFilePath()), { recursive: true });
    fs.writeFileSync(this.keyFilePath(), data);
  }

  getApiKey(): string | null {
    if (!fs.existsSync(this.keyFilePath())) return null;
    try {
      const data = fs.readFileSync(this.keyFilePath());
      const iv = data.subarray(0, 12);
      const authTag = data.subarray(12, 28);
      const encrypted = data.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch {
      return null;
    }
  }

  deleteApiKey(): void {
    try {
      fs.unlinkSync(this.keyFilePath());
    } catch {
      // file doesn't exist
    }
  }

  setSelectedModel(model: string): void {
    this.writeJson('onboarding.json', { ...this.readJson('onboarding.json'), selectedModel: model });
  }

  getSelectedModel(): string | null {
    const val = this.readJson('onboarding.json')?.selectedModel;
    return typeof val === 'string' ? val : null;
  }

  // --- Non-secret preferences. Plain JSON: these are settings, not secrets. ---

  getAnalyticsEnabled(): boolean {
    const val = this.readJson('preferences.json')?.analyticsEnabled;
    return typeof val === 'boolean' ? val : true; // on by default
  }

  setAnalyticsEnabled(enabled: boolean): void {
    this.writeJson('preferences.json', {
      ...this.readJson('preferences.json'),
      analyticsEnabled: enabled,
    });
  }

  /** True the very first time this machine ever launches Tomato, false afterwards. */
  consumeFirstLaunch(): boolean {
    const prefs = this.readJson('preferences.json');
    if (prefs?.hasLaunchedBefore === true) return false;
    this.writeJson('preferences.json', { ...prefs, hasLaunchedBefore: true });
    return true;
  }

  private keyFilePath(): string {
    return path.join(this.storagePath, 'api-key.enc');
  }

  private jsonFilePath(name: string): string {
    return path.join(this.storagePath, name);
  }

  private readJson(name: string): Record<string, unknown> | null {
    try {
      return JSON.parse(fs.readFileSync(this.jsonFilePath(name), 'utf8'));
    } catch {
      return null;
    }
  }

  private writeJson(name: string, data: Record<string, unknown>): void {
    fs.mkdirSync(this.storagePath, { recursive: true });
    fs.writeFileSync(this.jsonFilePath(name), JSON.stringify(data, null, 2));
  }
}
