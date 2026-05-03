import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import type { LlamaEngine } from './local-llm-client';

function log(msg: string): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'tomato.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [node-llama] ${msg}\n`);
  } catch {}
}

let nodeLlamaCpp: typeof import('node-llama-cpp') | null = null;

async function importNodeLlamaCpp() {
  if (!nodeLlamaCpp) {
    nodeLlamaCpp = await import('node-llama-cpp');
  }
  return nodeLlamaCpp;
}

export class NodeLlamaEngine implements LlamaEngine {
  private session: any = null;
  private modelName: string;
  private modelPath: string;
  private loading: Promise<void> | null = null;
  private loadError: Error | null = null;

  constructor(modelPath: string, modelName = 'llama3.2-3b-local') {
    this.modelPath = modelPath;
    this.modelName = modelName;
  }

  getModelName(): string {
    return this.modelName;
  }

  async prompt(text: string): Promise<string> {
    if (!this.session) {
      if (this.loadError) throw this.loadError;
      if (!this.loading) {
        this.loading = this.load();
      }
      await this.loading;
    }
    if (!this.session) throw new Error('Model failed to load');
    return this.session.prompt(text, { maxTokens: 300, temperature: 0.3 });
  }

  private async load(): Promise<void> {
    try {
      log(`Loading model from ${this.modelPath}`);

      const exists = fs.existsSync(this.modelPath);
      if (!exists) {
        throw new Error(`Model file not found: ${this.modelPath}`);
      }
      log(`Model file exists (${(fs.statSync(this.modelPath).size / 1e9).toFixed(1)} GB)`);

      const { getLlama, LlamaChatSession } = await importNodeLlamaCpp();
      log('node-llama-cpp imported');

      const llama = await getLlama();
      log('Llama instance created');

      const model = await llama.loadModel({ modelPath: this.modelPath });
      log('Model loaded into memory');

      const context = await model.createContext();
      log('Context created');

      this.session = new LlamaChatSession({ contextSequence: context.getSequence() });
      log('Chat session ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`FAILED to load model: ${msg}`);
      this.loadError = err instanceof Error ? err : new Error(msg);
      throw this.loadError;
    }
  }
}
