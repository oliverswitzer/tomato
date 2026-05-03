import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import type { IncomingMessage } from 'http';

export const MODEL_FILENAME = 'Llama-3.2-3B-Instruct-Q4_K_M.gguf';
export const MODEL_URL =
  'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf';

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

export type DownloadStatus =
  | { state: 'idle' }
  | { state: 'downloading'; progress: DownloadProgress }
  | { state: 'completed'; filePath: string }
  | { state: 'cancelled' }
  | { state: 'error'; error: string };

export class ModelDownloadManager {
  private modelsDir: string;
  private abortController: AbortController | null = null;
  private currentStatus: DownloadStatus = { state: 'idle' };
  private onProgress: ((status: DownloadStatus) => void) | null = null;

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir;
  }

  getModelPath(): string {
    return path.join(this.modelsDir, MODEL_FILENAME);
  }

  modelExists(): boolean {
    return fs.existsSync(this.getModelPath());
  }

  getStatus(): DownloadStatus {
    return this.currentStatus;
  }

  setProgressCallback(cb: (status: DownloadStatus) => void): void {
    this.onProgress = cb;
  }

  private emit(status: DownloadStatus): void {
    this.currentStatus = status;
    this.onProgress?.(status);
  }

  async download(): Promise<string> {
    if (this.modelExists()) {
      const filePath = this.getModelPath();
      this.emit({ state: 'completed', filePath });
      return filePath;
    }

    fs.mkdirSync(this.modelsDir, { recursive: true });

    const partialPath = this.getModelPath() + '.partial';
    this.abortController = new AbortController();

    let startByte = 0;
    if (fs.existsSync(partialPath)) {
      startByte = fs.statSync(partialPath).size;
    }

    try {
      const filePath = await this.downloadWithRedirects(MODEL_URL, partialPath, startByte);
      this.abortController = null;
      return filePath;
    } catch (err: any) {
      this.abortController = null;

      if (err.name === 'AbortError' || err.message === 'Download cancelled') {
        this.cleanupPartialFile(partialPath);
        this.emit({ state: 'cancelled' });
        throw err;
      }

      this.cleanupPartialFile(partialPath);
      const errorMsg = err.message || 'Download failed';
      this.emit({ state: 'error', error: errorMsg });
      throw err;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private cleanupPartialFile(partialPath: string): void {
    try {
      if (fs.existsSync(partialPath)) {
        fs.unlinkSync(partialPath);
      }
    } catch {}
  }

  private downloadWithRedirects(
    url: string,
    partialPath: string,
    startByte: number,
    redirectCount = 0,
  ): Promise<string> {
    if (redirectCount > 5) {
      return Promise.reject(new Error('Too many redirects'));
    }

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (startByte > 0) {
        headers['Range'] = `bytes=${startByte}-`;
      }

      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.get(url, { headers }, (res: IncomingMessage) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          this.downloadWithRedirects(res.headers.location, partialPath, startByte, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode === 416) {
          // Range not satisfiable — file is complete or server doesn't support range
          this.cleanupPartialFile(partialPath);
          startByte = 0;
          res.resume();
          this.downloadWithRedirects(url, partialPath, 0, redirectCount + 1)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        const isPartial = res.statusCode === 206;
        const contentLength = parseInt(res.headers['content-length'] ?? '0', 10);
        const totalBytes = isPartial ? startByte + contentLength : contentLength;

        let downloadedBytes = isPartial ? startByte : 0;

        this.emit({
          state: 'downloading',
          progress: {
            downloadedBytes,
            totalBytes,
            percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
          },
        });

        const flags = isPartial ? 'a' : 'w';
        const fileStream = fs.createWriteStream(partialPath, { flags });

        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          this.emit({
            state: 'downloading',
            progress: {
              downloadedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
            },
          });
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => {
            const finalPath = this.getModelPath();
            try {
              fs.renameSync(partialPath, finalPath);
              this.emit({ state: 'completed', filePath: finalPath });
              resolve(finalPath);
            } catch (err) {
              reject(err);
            }
          });
        });

        res.on('error', (err) => {
          fileStream.close();
          reject(err);
        });

        fileStream.on('error', (err) => {
          res.destroy();
          reject(err);
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (this.abortController) {
        const signal = this.abortController.signal;
        const onAbort = () => {
          req.destroy();
          reject(new Error('Download cancelled'));
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }
    });
  }
}
