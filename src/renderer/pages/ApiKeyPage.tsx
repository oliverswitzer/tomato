import { useState, useRef } from 'react';

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

type PageState = 'entry' | 'verifying' | 'error';

function StepDots({ current }: { current: number }) {
  const steps = ['Permissions', 'API Key', 'Intent'];
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

export function ApiKeyPage() {
  const [key, setKey] = useState('');
  const [pageState, setPageState] = useState<PageState>('entry');
  const [errorMessage, setErrorMessage] = useState('');
  const [retryable, setRetryable] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleKeyChange(value: string) {
    setKey(value.replace(/[\s\n\r]/g, ''));
    if (pageState === 'error') {
      setPageState('entry');
      setErrorMessage('');
    }
  }

  async function handleContinue() {
    const trimmed = key.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }

    setPageState('verifying');
    setErrorMessage('');

    const result = await window.tomato.validateApiKey(trimmed);

    if (result.valid) {
      const saveResult = await window.tomato.saveApiKey(trimmed, result.selectedModel!);
      if (saveResult.success) {
        window.tomato.apiKeyComplete();
      } else {
        setPageState('error');
        setErrorMessage(saveResult.error ?? "Tomato can't write to your Keychain.");
        setRetryable(true);
      }
    } else {
      setPageState('error');
      setErrorMessage(result.error ?? 'Validation failed.');
      setRetryable(result.retryable ?? false);

      if (result.retryable && result.error?.includes('rate-limiting')) {
        setTimeout(async () => {
          const retry = await window.tomato.validateApiKey(trimmed);
          if (retry.valid) {
            const saveResult = await window.tomato.saveApiKey(trimmed, retry.selectedModel!);
            if (saveResult.success) {
              window.tomato.apiKeyComplete();
            }
          }
        }, 3000);
      }
    }
  }

  const maskedKey = key.length > 4
    ? '•'.repeat(key.length - 4) + key.slice(-4)
    : key;

  const isVerifying = pageState === 'verifying';
  const isError = pageState === 'error';

  return (
    <div
      className="h-screen overflow-hidden rounded-[28px] flex flex-col items-center"
      style={{ background: '#FBF7F1', WebkitAppRegion: 'drag', padding: '44px 80px 40px', gap: 28 } as React.CSSProperties}
    >
      {/* Step dots */}
      <StepDots current={1} />

      {/* Header */}
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
          Your key stays on this Mac — stored in the system Keychain, never sent to our servers.
          Tomato calls Anthropic directly to summarize your activity and detect drift.
        </p>
      </div>

      {/* Input area */}
      <div className="w-full flex flex-col" style={{ gap: 14, ...noDrag }}>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <label
            className="text-[13px] font-medium text-[#5E5A52]"
            htmlFor="api-key-input"
          >
            Anthropic API Key
          </label>
          <div className="relative">
            <input
              ref={inputRef}
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
                const pasted = e.clipboardData.getData('text');
                handleKeyChange(pasted);
              }}
              disabled={isVerifying}
              autoFocus
            />
          </div>
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

      {/* CTA */}
      <div className="w-full flex flex-col items-center" style={{ gap: 14, ...noDrag }}>
        <button
          onClick={handleContinue}
          disabled={isVerifying || !key.trim()}
          className="w-full flex items-center justify-center rounded-[12px] text-white text-[14px] font-semibold transition-colors hover:brightness-95 active:brightness-90"
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

        <button
          onClick={() => {
            window.tomato.skipApiKey();
            window.tomato.apiKeyComplete();
          }}
          disabled={isVerifying}
          className="text-[13px] font-medium transition-colors hover:text-[#6B6259]"
          style={{ color: '#8B8477' }}
        >
          Skip for now
        </button>
        <p className="text-[11px] text-center" style={{ color: '#BAA898', maxWidth: 360 }}>
          Without an API key, Tomato works as a plain pomodoro timer.
          You can add your key later in Settings.
        </p>
      </div>
    </div>
  );
}
