import fs from 'fs';
import path from 'path';
import type { VaultItem } from '../shared/ipc';

const MAX_ITEMS = 100;

export class VaultStore {
  private filePath: string;

  constructor(storagePath: string) {
    this.filePath = path.join(storagePath, 'vault.json');
  }

  save(item: VaultItem): void {
    const items = this.readItems();
    items.push(item);
    if (items.length > MAX_ITEMS) items.splice(0, items.length - MAX_ITEMS);
    this.writeItems(items);
  }

  getItems(): VaultItem[] {
    return this.readItems().reverse();
  }

  delete(id: string): void {
    const items = this.readItems().filter((item) => item.id !== id);
    this.writeItems(items);
  }

  private readItems(): VaultItem[] {
    try {
      const data = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  private writeItems(items: VaultItem[]): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2));
  }
}
