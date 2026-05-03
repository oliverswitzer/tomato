import fs from 'fs';

export interface LlamaEngine {
  prompt(text: string): Promise<string>;
  getModelName(): string;
  dispose(): Promise<void>;
}

export class NodeLlamaEngine implements LlamaEngine {
  private session: any = null;
  private model: any = null;
  private llama: any = null;
  private modelName: string;
  private modelPath: string;
  private loading: Promise<void> | null = null;
  private loadError: Error | null = null;
  private logPath: string | null;

  constructor(modelPath: string, options?: { modelName?: string; logPath?: string }) {
    this.modelPath = modelPath;
    this.modelName = options?.modelName ?? 'llama3.2-3b-local';
    this.logPath = options?.logPath ?? null;
  }

  private log(msg: string): void {
    if (!this.logPath) return;
    const line = `[${new Date().toISOString()}] [llama-engine] ${msg}\n`;
    try { fs.appendFileSync(this.logPath, line); } catch {}
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

    this.log(`Prompting with ${text.length} chars`);
    const result = await this.session.prompt(text, { maxTokens: 300, temperature: 0.3 });
    this.log(`Got response: ${result.length} chars`);
    return result;
  }

  getModelName(): string {
    return this.modelName;
  }

  async dispose(): Promise<void> {
    if (this.model) {
      try { await this.model.dispose?.(); } catch {}
      this.model = null;
    }
    if (this.llama) {
      try { await this.llama.dispose?.(); } catch {}
      this.llama = null;
    }
    this.session = null;
    this.loading = null;
    this.loadError = null;
  }

  private async load(): Promise<void> {
    try {
      if (!fs.existsSync(this.modelPath)) {
        throw new Error(`Model file not found: ${this.modelPath}`);
      }

      this.log(`Loading model from ${this.modelPath}`);

      // node-llama-cpp is ESM-only; use dynamic import in CommonJS
      const { getLlama, LlamaChatSession } = await new Function(
        'return import("node-llama-cpp")',
      )() as typeof import('node-llama-cpp');

      this.llama = await getLlama();
      this.log('Got Llama instance');

      this.model = await this.llama.loadModel({ modelPath: this.modelPath });
      this.log('Model loaded');

      const context = await this.model.createContext({ contextSize: 2048 });
      this.log('Context created (size=2048)');

      const contextSequence = context.getSequence();
      this.session = new LlamaChatSession({ contextSequence });
      this.log('Chat session ready');
    } catch (err) {
      this.loadError = err as Error;
      this.log(`Load failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
