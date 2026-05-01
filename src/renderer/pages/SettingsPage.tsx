import { useState, useEffect, useRef, useCallback } from 'react';
import type { ModelInfo, SettingsState } from '@shared/ipc';
import { ModelPicker, formatModelName } from '../components/ModelPicker';

const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

type PageMode = 'loading' | 'no-key' | 'saved' | 'editing' | 'error';

function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="3" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B14A3C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#2A2A2A',
        color: '#FFFFFF',
        borderRadius: 10,
        padding: '10px 16px',
        fontFamily: 'Inter, sans-serif',
        fontSize: 12,
        fontWeight: 500,
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        zIndex: 1000,
        animation: 'toast-in 0.2s ease-out',
      }}
    >
      <span style={{ color: '#7CB342' }}><CheckIcon /></span>
      {message}
    </div>
  );
}

interface SettingsPageProps {
  onClose: () => void;
}

export function SettingsPage({ onClose }: SettingsPageProps) {
  const [mode, setMode] = useState<PageMode>('loading');
  const [settingsState, setSettingsState] = useState<SettingsState | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modelError, setModelError] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.tomato.getSettingsState().then((state) => {
      setSettingsState(state);
      setSelectedModel(state.selectedModel);
      setMode(state.hasApiKey ? 'saved' : 'no-key');

      if (state.hasApiKey) {
        window.tomato.fetchModels().then((result) => {
          if (result.models.length > 0) {
            setModels(result.models);
          } else if (result.error) {
            setModelError(result.error);
          }
        });
      }
    });
  }, []);

  function handleKeyChange(value: string) {
    setKeyInput(value.replace(/[\s\n\r]/g, ''));
    if (mode === 'error') {
      setMode(settingsState?.hasApiKey ? 'editing' : 'no-key');
      setErrorMessage('');
    }
  }

  async function handleSave() {
    const trimmed = keyInput.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }

    setIsValidating(true);
    setErrorMessage('');

    const result = await window.tomato.validateApiKey(trimmed);

    if (result.valid) {
      const saveResult = await window.tomato.saveApiKey(trimmed, result.selectedModel!);
      if (saveResult.success) {
        const newState = await window.tomato.getSettingsState();
        setSettingsState(newState);
        setSelectedModel(newState.selectedModel);
        setMode('saved');
        setKeyInput('');
        setIsValidating(false);
        setToastMessage('API key updated');

        const modelResult = await window.tomato.fetchModels();
        if (modelResult.models.length > 0) {
          setModels(modelResult.models);
          setModelError('');
        }
        return;
      } else {
        setErrorMessage(saveResult.error ?? "Tomato can't write to your Keychain.");
      }
    } else {
      setErrorMessage(result.error ?? 'Validation failed.');

      if (result.retryable && result.error?.includes('rate-limiting')) {
        setTimeout(async () => {
          const retry = await window.tomato.validateApiKey(trimmed);
          if (retry.valid) {
            const saveResult = await window.tomato.saveApiKey(trimmed, retry.selectedModel!);
            if (saveResult.success) {
              const newState = await window.tomato.getSettingsState();
              setSettingsState(newState);
              setSelectedModel(newState.selectedModel);
              setMode('saved');
              setKeyInput('');
              setIsValidating(false);
              setToastMessage('API key updated');

              const modelResult = await window.tomato.fetchModels();
              if (modelResult.models.length > 0) setModels(modelResult.models);
              return;
            }
          }
        }, 3000);
      }
    }

    setIsValidating(false);
    setMode('error');
  }

  function handleModelSelect(modelId: string) {
    setSelectedModel(modelId);
    setDropdownOpen(false);
    window.tomato.updateModel(modelId);
    setToastMessage(`Switched to ${formatModelName(modelId)}`);
  }

  const dismissToast = useCallback(() => setToastMessage(null), []);

  const maskedInput = keyInput.length > 4
    ? '•'.repeat(keyInput.length - 4) + keyInput.slice(-4)
    : keyInput;

  const hasKeyChanges = keyInput.trim().length > 0;
  const isNoKey = mode === 'no-key';
  const isSaved = mode === 'saved';
  const isEditing = mode === 'editing';
  const isError = mode === 'error';

  if (mode === 'loading') return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col"
        style={{
          width: 400,
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #E8E1D7',
          boxShadow: '0 12px 28px rgba(0,0,0,0.1)',
          padding: '20px 22px',
          gap: isSaved ? 16 : 18,
          ...noDrag,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1
            style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 22,
              fontWeight: 500,
              color: '#2A2A2A',
              margin: 0,
            }}
          >
            Settings
          </h1>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#8B8477',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CloseIcon />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#2A2A2A' }}>
              Anthropic API key
            </span>
            {isNoKey && (
              <a
                href="https://console.anthropic.com/settings/keys"
                onClick={(e) => { e.preventDefault(); window.open('https://console.anthropic.com/settings/keys', '_blank'); }}
                style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, color: '#B86B60', cursor: 'pointer', textDecoration: 'none' }}
              >
                Get a key &rarr;
              </a>
            )}
          </div>

          {(isNoKey || isEditing || isError) ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#FBF7F1',
                borderRadius: 8,
                border: `1px solid ${isError ? '#E2574C' : '#E8E1D7'}`,
                padding: '10px 12px',
              }}
            >
              <input
                ref={inputRef}
                type="text"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  color: '#2A2A2A',
                }}
                placeholder="sk-ant-api03-…"
                value={maskedInput}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length < maskedInput.length) {
                    setKeyInput(keyInput.slice(0, -1));
                  } else {
                    const added = v.slice(maskedInput.length);
                    handleKeyChange(keyInput + added);
                  }
                }}
                onPaste={(e) => {
                  e.preventDefault();
                  handleKeyChange(e.clipboardData.getData('text'));
                }}
                disabled={isValidating}
                autoFocus
              />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#FBF7F1',
                borderRadius: 8,
                border: '1px solid #E8E1D7',
                padding: '10px 12px',
                gap: 8,
                cursor: 'pointer',
              }}
              onClick={() => setMode('editing')}
            >
              <span
                style={{
                  flex: 1,
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 12,
                  color: '#2A2A2A',
                }}
              >
                {settingsState?.maskedKey ?? ''}
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  background: '#EEF6E3',
                  borderRadius: 999,
                  padding: '3px 8px',
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  fontWeight: 500,
                  color: '#5A7A2F',
                  letterSpacing: 0.3,
                }}
              >
                &#x2713; Connected
              </span>
            </div>
          )}

          {isNoKey && (
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#8B8477', lineHeight: 1.5, margin: 0 }}>
              Used to summarize your screen activity. Stored in your Mac&apos;s Keychain &mdash; never sent anywhere else.
            </p>
          )}
        </div>

        {isError && errorMessage && (
          <div
            style={{
              display: 'flex',
              gap: 10,
              background: '#FBE9E7',
              borderRadius: 10,
              border: '1px solid #E2574C',
              padding: '12px 14px',
            }}
          >
            <AlertCircleIcon />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#7A2E25', lineHeight: 1.5, flex: 1 }}>
              {errorMessage}
            </span>
          </div>
        )}

        {isError && (
          <button
            onClick={() => { setMode('editing'); setErrorMessage(''); inputRef.current?.focus(); }}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'Inter, sans-serif',
              fontSize: 12,
              fontWeight: 500,
              color: '#B86B60',
              cursor: 'pointer',
              textAlign: 'center',
              padding: 0,
            }}
          >
            Edit key &rarr;
          </button>
        )}

        {isNoKey && (
          <p
            style={{
              fontFamily: "'Newsreader', Georgia, serif",
              fontSize: 12,
              fontStyle: 'italic',
              color: '#A89F94',
              margin: 0,
            }}
          >
            Model selector appears here once a key is saved.
          </p>
        )}

        {(isSaved || isEditing) && (
          <ModelPicker
            models={models}
            selectedModel={selectedModel}
            onSelect={handleModelSelect}
            open={dropdownOpen}
            onToggle={() => setDropdownOpen(!dropdownOpen)}
            error={modelError}
          />
        )}

        {!isError && hasKeyChanges && (
          <button
            onClick={handleSave}
            disabled={isValidating}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              background: '#E2574C',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontFamily: 'Inter, sans-serif',
              fontSize: 14,
              fontWeight: 600,
              cursor: isValidating ? 'not-allowed' : 'pointer',
              opacity: isValidating ? 0.4 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {isValidating ? (
              <>
                <Spinner />
                Verifying key&hellip;
              </>
            ) : (
              'Save'
            )}
          </button>
        )}

        {isSaved && !hasKeyChanges && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: '#A89F94', textAlign: 'center', margin: 0 }}>
            Models are fetched live from your Anthropic account.
          </p>
        )}
      </div>

      {toastMessage && <Toast message={toastMessage} onDone={dismissToast} />}
    </div>
  );
}
