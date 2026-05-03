import type { LlamaEngine } from './local-llm-client';

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

  constructor(modelPath: string, modelName = 'llama3.2-3b-local') {
    this.modelPath = modelPath;
    this.modelName = modelName;
  }

  getModelName(): string {
    return this.modelName;
  }

  async prompt(text: string): Promise<string> {
    if (!this.session) {
      if (!this.loading) {
        this.loading = this.load();
      }
      await this.loading;
    }
    return this.session.prompt(text, { maxTokens: 300, temperature: 0.3 });
  }

  private async load(): Promise<void> {
    const { getLlama, LlamaChatSession } = await importNodeLlamaCpp();
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath: this.modelPath });
    const context = await model.createContext();
    this.session = new LlamaChatSession({ contextSequence: context.getSequence() });
  }
}
