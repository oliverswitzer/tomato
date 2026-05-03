import { useState, useEffect } from 'react';
import type { ModelDownloadStatus } from '@shared/ipc';

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

function StepDots({ current }: { current: number }) {
  const steps = ['Permissions', 'AI Setup', 'Intent'];
  return (
    <div className="flex items-center" style={{ gap: 8 }}>
      {steps.map((label, i) => (
        <div key={label} className="flex items-center" style={{ gap: 8 }}>
          <div className="flex items-center" style={{ gap: 6 }}>
            <div
              className="rounded-full flex items-center justify-center text-[10px] font-semibold"
              style={{
                width: 20,
                height: 20,
                background: i < current ? '#7CB342' : i === current ? '#E2574C' : '#D6D2C8',
                color: 'white',
              }}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span
              className="text-[12px]"
              style={{ color: i === current ? '#2A2A2A' : '#8B8477', fontWeight: i === current ? 600 : 400 }}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: 24, height: 1, background: '#D6D2C8' }} />
          )}
        </div>
      ))}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type PageView = 'choose' | 'downloading' | 'api-key';

export function LlmSourcePage() {
  const [view, setView] = useState<PageView>('choose');
  const [downloadStatus, setDownloadStatus] = useState<ModelDownloadStatus>({ state: 'idle' });
  const [modelExists, setModelExists] = useState(false);
  const [lowMemory, setLowMemory] = useState(false);

  // API key entry state
  const [key, setKey] = useState('');
  const [keyState, setKeyState] = useState<'entry' | 'verifying' | 'error'>('entry');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryable, setRetryable] = useState(false);

  useEffect(() => {
    window.tomato.checkModelExists().then(setModelExists);
    window.tomato.getSystemMemoryGB().then((gb) => setLowMemory(gb < 16));
  }, []);

  useEffect(() => {
    const unsub = window.tomato.onModelDownloadProgress((status) => {
      setDownloadStatus(status);
      if (status.state === 'completed') {
        window.tomato.llmSourceComplete('local');
      }
    });
    return unsub;
  }, []);

  function handleSelectLocal() {
    if (modelExists) {
      window.tomato.setLlmSource('local');
      window.tomato.llmSourceComplete('local');
      return;
    }
    setView('downloading');
    window.tomato.startModelDownload();
  }

  function handleSelectAnthropic() {
    setView('api-key');
  }

  function handleCancelDownload() {
    window.tomato.cancelModelDownload();
    setView('choose');
    setDownloadStatus({ state: 'idle' });
  }

  function handleRetryDownload() {
    setDownloadStatus({ state: 'idle' });
    window.tomato.startModelDownload();
  }

  function handleKeyChange(value: string) {
    setKey(value.replace(/[\s\n\r]/g, ''));
    if (keyState === 'error') {
      setKeyState('entry');
      setErrorMessage('');
    }
  }

  async function handleKeyContinue() {
    const trimmed = key.trim();
    if (!trimmed) return;

    setKeyState('verifying');
    setErrorMessage('');

    const result = await window.tomato.validateApiKey(trimmed);

    if (result.valid) {
      const saveResult = await window.tomato.saveApiKey(trimmed, result.selectedModel!);
      if (saveResult.success) {
        await window.tomato.setLlmSource('anthropic');
        window.tomato.llmSourceComplete('anthropic');
      } else {
        setKeyState('error');
        setErrorMessage(saveResult.error ?? "Couldn't save key.");
        setRetryable(true);
      }
    } else {
      setKeyState('error');
      setErrorMessage(result.error ?? 'Validation failed.');
      setRetryable(result.retryable ?? false);

      if (result.retryable && result.error?.includes('rate-limiting')) {
        setTimeout(async () => {
          const retry = await window.tomato.validateApiKey(trimmed);
          if (retry.valid) {
            const saveResult = await window.tomato.saveApiKey(trimmed, retry.selectedModel!);
            if (saveResult.success) {
              await window.tomato.setLlmSource('anthropic');
              window.tomato.llmSourceComplete('anthropic');
            }
          }
        }, 3000);
      }
    }
  }

  const maskedKey = key.length > 4 ? '•'.repeat(key.length - 4) + key.slice(-4) : key;
  const isVerifying = keyState === 'verifying';
  const isError = keyState === 'error';

  return (
    <div
      className="h-screen overflow-hidden rounded-[28px] flex flex-col items-center"
      style={{ background: '#FBF7F1', WebkitAppRegion: 'drag', padding: '44px 80px 40px', gap: 28 } as React.CSSProperties}
    >
      <StepDots current={1} />

      {view === 'choose' && (
        <>
          <div className="flex flex-col items-center" style={{ gap: 14 }}>
            <div
              className="rounded-[48px] flex items-center justify-center overflow-hidden"
              style={{ width: 96, height: 96, border: '1px solid #EFE8DD', boxShadow: '0 6px 20px rgba(226,87,76,0.1)', fontSize: 52, lineHeight: 1 }}
            >
              🧠
            </div>
            <h1
              className="text-center text-[#2A2A2A]"
              style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 36, fontWeight: 500, letterSpacing: '-0.4px' }}
            >
              Choose your AI engine
            </h1>
            <p className="text-center text-[#8B8477]" style={{ fontSize: 14, lineHeight: 1.45, maxWidth: 480 }}>
              Tomato uses AI to summarize your activity and detect drift. Choose how it runs.
            </p>
          </div>

          <div className="w-full flex flex-col" style={{ gap: 12, ...noDrag }}>
            {/* Local option */}
            <button
              onClick={handleSelectLocal}
              className="w-full text-left rounded-[14px] border transition-colors hover:border-[#E2574C]"
              style={{
                background: 'white',
                borderColor: '#EFE8DD',
                padding: '18px 20px',
              }}
            >
              <div className="flex items-start" style={{ gap: 14 }}>
                <div
                  className="rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, background: '#EEF6E3', fontSize: 20 }}
                >
                  💻
                </div>
                <div className="flex flex-col" style={{ gap: 4 }}>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <span className="text-[15px] font-semibold text-[#2A2A2A]">Run locally</span>
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide rounded-full"
                      style={{ background: '#EEF6E3', color: '#5A7A2F', padding: '2px 8px' }}
                    >
                      Recommended
                    </span>
                  </div>
                  <p className="text-[13px] text-[#8B8477]" style={{ lineHeight: 1.4 }}>
                    Download Llama 3.2 (1.9 GB). All data stays on your device. No API key needed.
                  </p>
                  {lowMemory && (
                    <p className="text-[12px]" style={{ color: '#C4700A', lineHeight: 1.4, marginTop: 2 }}>
                      ⚠ Best for Apple Silicon Macs with 16 GB+ RAM. Your system has less.
                    </p>
                  )}
                  {!lowMemory && (
                    <p className="text-[12px] text-[#A89F94]" style={{ lineHeight: 1.4, marginTop: 2 }}>
                      Recommended for Apple Silicon Macs with 16 GB+ RAM. All data stays on your device.
                    </p>
                  )}
                </div>
              </div>
            </button>

            {/* Anthropic option */}
            <button
              onClick={handleSelectAnthropic}
              className="w-full text-left rounded-[14px] border transition-colors hover:border-[#E2574C]"
              style={{
                background: 'white',
                borderColor: '#EFE8DD',
                padding: '18px 20px',
              }}
            >
              <div className="flex items-start" style={{ gap: 14 }}>
                <div
                  className="rounded-[10px] flex items-center justify-center shrink-0"
                  style={{ width: 40, height: 40, background: '#FBE9E7', fontSize: 20 }}
                >
                  🔑
                </div>
                <div className="flex flex-col" style={{ gap: 4 }}>
                  <span className="text-[15px] font-semibold text-[#2A2A2A]">Anthropic API key</span>
                  <p className="text-[13px] text-[#8B8477]" style={{ lineHeight: 1.4 }}>
                    Cloud-based. Requires internet. ~$0.50/month for typical usage.
                  </p>
                </div>
              </div>
            </button>
          </div>
        </>
      )}

      {view === 'downloading' && (
        <>
          <div className="flex flex-col items-center" style={{ gap: 14 }}>
            <div
              className="rounded-[48px] flex items-center justify-center overflow-hidden"
              style={{ width: 96, height: 96, border: '1px solid #EFE8DD', boxShadow: '0 6px 20px rgba(226,87,76,0.1)', fontSize: 52, lineHeight: 1 }}
            >
              💻
            </div>
            <h1
              className="text-center text-[#2A2A2A]"
              style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 36, fontWeight: 500, letterSpacing: '-0.4px' }}
            >
              {downloadStatus.state === 'error' ? 'Download failed' : 'Downloading model'}
            </h1>
            <p className="text-center text-[#8B8477]" style={{ fontSize: 14, lineHeight: 1.45, maxWidth: 480 }}>
              {downloadStatus.state === 'error'
                ? downloadStatus.error
                : 'Llama 3.2 3B — a small, fast model that runs entirely on your Mac.'}
            </p>
          </div>

          <div className="w-full flex flex-col items-center" style={{ gap: 16, ...noDrag }}>
            {downloadStatus.state === 'downloading' && (
              <div className="w-full flex flex-col" style={{ gap: 8 }}>
                <div
                  className="w-full rounded-full overflow-hidden"
                  style={{ height: 8, background: '#EFE8DD' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${downloadStatus.progress.percent}%`,
                      background: '#E2574C',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                <div className="flex justify-between text-[12px] text-[#8B8477]">
                  <span>{downloadStatus.progress.percent}%</span>
                  <span>
                    {formatBytes(downloadStatus.progress.downloadedBytes)} / {formatBytes(downloadStatus.progress.totalBytes)}
                  </span>
                </div>
              </div>
            )}

            {(downloadStatus.state === 'idle' || downloadStatus.state === 'downloading') && (
              <button
                onClick={handleCancelDownload}
                className="text-[13px] font-medium hover:underline"
                style={{ color: '#8B8477', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
            )}

            {downloadStatus.state === 'error' && (
              <div className="flex" style={{ gap: 12 }}>
                <button
                  onClick={() => { setView('choose'); setDownloadStatus({ state: 'idle' }); }}
                  className="rounded-[10px] text-[14px] font-medium"
                  style={{ padding: '10px 20px', background: 'none', border: '1px solid #D6D2C8', color: '#5E5A52', cursor: 'pointer' }}
                >
                  Back
                </button>
                <button
                  onClick={handleRetryDownload}
                  className="rounded-[10px] text-[14px] font-semibold text-white"
                  style={{ padding: '10px 20px', background: '#E2574C', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(226,87,76,0.25)' }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'api-key' && (
        <>
          <div className="flex flex-col items-center" style={{ gap: 14 }}>
            <div
              className="rounded-[48px] flex items-center justify-center overflow-hidden"
              style={{ width: 96, height: 96, border: '1px solid #EFE8DD', boxShadow: '0 6px 20px rgba(226,87,76,0.1)', fontSize: 52, lineHeight: 1 }}
            >
              🔑
            </div>
            <h1
              className="text-center text-[#2A2A2A]"
              style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 36, fontWeight: 500, letterSpacing: '-0.4px' }}
            >
              Add your Anthropic key
            </h1>
            <p className="text-center text-[#8B8477]" style={{ fontSize: 14, lineHeight: 1.45, maxWidth: 480 }}>
              Your key stays on this Mac — stored encrypted, never sent to our servers.
            </p>
          </div>

          <div className="w-full flex flex-col" style={{ gap: 14, ...noDrag }}>
            <div className="flex flex-col" style={{ gap: 8 }}>
              <label className="text-[13px] font-medium text-[#5E5A52]" htmlFor="api-key-input">
                Anthropic API Key
              </label>
              <input
                id="api-key-input"
                type="text"
                className="w-full rounded-[12px] border text-[14px] text-[#2A2A2A] outline-none transition-colors"
                style={{
                  padding: '14px 16px',
                  fontFamily: 'monospace',
                  borderColor: isError ? '#E2574C' : '#EFE8DD',
                  background: 'white',
                }}
                placeholder="sk-ant-…"
                value={maskedKey}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length < maskedKey.length) {
                    setKey(key.slice(0, -1));
                  } else {
                    const added = v.slice(maskedKey.length);
                    handleKeyChange(key + added);
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  handleKeyChange(e.clipboardData.getData('text'));
                }}
                disabled={isVerifying}
                autoFocus
              />
              {isError && errorMessage && (
                <p className="text-[13px]" style={{ color: '#E2574C', lineHeight: 1.4 }}>
                  {errorMessage}
                </p>
              )}
            </div>

            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium hover:underline"
              style={{ color: '#8B8477' }}
              onClick={(e) => {
                e.preventDefault();
                window.open('https://console.anthropic.com/settings/keys', '_blank');
              }}
            >
              Don't have a key? Get one from console.anthropic.com →
            </a>
          </div>

          <div className="w-full flex flex-col items-center" style={{ gap: 14, ...noDrag }}>
            <div className="w-full flex" style={{ gap: 10 }}>
              <button
                onClick={() => setView('choose')}
                className="rounded-[12px] text-[14px] font-medium"
                style={{ padding: '14px 20px', background: 'none', border: '1px solid #D6D2C8', color: '#5E5A52', cursor: 'pointer' }}
              >
                Back
              </button>
              <button
                onClick={handleKeyContinue}
                disabled={isVerifying || !key.trim()}
                className="flex-1 flex items-center justify-center rounded-[12px] text-white text-[14px] font-semibold transition-colors hover:brightness-95 active:brightness-90"
                style={{
                  background: '#E2574C',
                  padding: '14px 16px',
                  boxShadow: '0 4px 14px rgba(226,87,76,0.25)',
                  opacity: isVerifying || !key.trim() ? 0.7 : 1,
                  cursor: isVerifying || !key.trim() ? 'not-allowed' : 'pointer',
                  gap: 8,
                }}
              >
                {isVerifying ? (
                  <>
                    <Spinner />
                    Verifying key…
                  </>
                ) : isError && retryable ? (
                  'Retry'
                ) : (
                  'Continue'
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}
