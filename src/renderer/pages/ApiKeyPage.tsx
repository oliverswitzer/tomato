import { useState, useRef } from 'react';
import { Button } from '../components/ui/Button';

type PageState = 'entry' | 'verifying' | 'error';

function StepDots({ current }: { current: number }) {
  const steps = ['Permissions', 'API Key', 'Intent'];
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white ${
                i < current ? 'bg-[#7CB342]' : i === current ? 'bg-accent' : 'bg-[#D6D2C8]'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span
              className={`text-xs ${i === current ? 'font-semibold text-text' : 'font-normal text-muted'}`}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && <div className="h-px w-6 bg-[#D6D2C8]" />}
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
    <div className="flex h-screen flex-col items-center overflow-hidden rounded-[28px] bg-cream px-20 pb-10 pt-11 gap-7 [-webkit-app-region:drag]">
      {/* Step dots */}
      <StepDots current={1} />

      {/* Header */}
      <div className="flex flex-col items-center gap-3.5">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[48px] border border-border text-[52px] leading-none shadow-[0_6px_20px_rgba(226,87,76,0.1)]">
          🔑
        </div>

        <h1 className="text-center font-serif text-[36px] font-medium tracking-[-0.4px] text-text">
          Add your Anthropic key
        </h1>

        <p className="max-w-[480px] text-center text-sm leading-[1.45] text-muted">
          Your key stays on this Mac — stored in the system Keychain, never sent to our servers.
          Tomato calls Anthropic directly to summarize your activity and detect drift.
        </p>
      </div>

      {/* Input area */}
      <div className="flex w-full flex-col gap-3.5 [-webkit-app-region:no-drag]">
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-medium text-[#5E5A52]" htmlFor="api-key-input">
            Anthropic API Key
          </label>
          <div className="relative">
            <input
              ref={inputRef}
              id="api-key-input"
              type="text"
              className={`w-full rounded-xl border bg-white px-4 py-3.5 font-mono text-sm text-text outline-none transition-colors ${
                isError ? 'border-accent' : 'border-border'
              }`}
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
            <p className="text-[13px] leading-[1.4] text-accent">{errorMessage}</p>
          )}
        </div>

        <a
          href="https://console.anthropic.com/settings/keys"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[13px] font-medium text-muted hover:underline"
          onClick={(e) => {
            e.preventDefault();
            window.open('https://console.anthropic.com/settings/keys', '_blank');
          }}
        >
          Don't have a key? Get one from console.anthropic.com →
        </a>
      </div>

      {/* CTA */}
      <div className="flex w-full flex-col items-center gap-3.5 [-webkit-app-region:no-drag]">
        <Button
          variant="primary"
          onClick={handleContinue}
          disabled={isVerifying || !key.trim()}
          className="w-full gap-2"
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
        </Button>

        <p className="max-w-[360px] text-center text-[11px] text-subtle">
          Tomato needs an Anthropic API key to summarize your activity and detect drift.
        </p>
      </div>
    </div>
  );
}
