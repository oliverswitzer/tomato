import { safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';

export interface KeychainStore {
  saveApiKey(key: string): void;
  getApiKey(): string | null;
  deleteApiKey(): void;
  setSkipped(skipped: boolean): void;
  wasSkipped(): boolean;
  setSelectedModel(model: string): void;
  getSelectedModel(): string | null;
}

export class ElectronKeychainStore implements KeychainStore {
  constructor(private storagePath: string) {}

  saveApiKey(key: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('Encryption not available — cannot store API key securely');
    }
    const encrypted = safeStorage.encryptString(key);
    fs.mkdirSync(path.dirname(this.keyFilePath()), { recursive: true });
    fs.writeFileSync(this.keyFilePath(), encrypted);
  }

  getApiKey(): string | null {
    if (!fs.existsSync(this.keyFilePath())) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      const encrypted = fs.readFileSync(this.keyFilePath());
      return safeStorage.decryptString(Buffer.from(encrypted));
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

  setSkipped(skipped: boolean): void {
    this.writeJson('onboarding.json', { ...this.readJson('onboarding.json'), skipped });
  }

  wasSkipped(): boolean {
    return this.readJson('onboarding.json')?.skipped === true;
  }

  setSelectedModel(model: string): void {
    this.writeJson('onboarding.json', { ...this.readJson('onboarding.json'), selectedModel: model });
  }

  getSelectedModel(): string | null {
    const val = this.readJson('onboarding.json')?.selectedModel;
    return typeof val === 'string' ? val : null;
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
