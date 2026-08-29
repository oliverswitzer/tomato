import { useState, useEffect, useRef, useCallback } from 'react';
import type { ModelInfo, SettingsState } from '@shared/ipc';
import { ModelPicker, formatModelName } from '../components/ModelPicker';
import { Button } from '../components/ui/Button';

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
    <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-xl bg-text px-4 py-2.5 text-xs font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] z-[1000] [animation:toast-in_0.2s_ease-out]">
      <span className="text-[#7CB342]"><CheckIcon /></span>
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={`[-webkit-app-region:no-drag] relative flex w-96 flex-col rounded-2xl border border-[#E8E1D7] bg-white px-6 py-5 shadow-[0_12px_28px_rgba(0,0,0,0.1)] ${
          isSaved ? 'gap-4' : 'gap-5'
        }`}
      >
        <div className="flex items-center justify-between">
          <h1 className="m-0 font-serif text-2xl font-medium text-text">Settings</h1>
          <button
            onClick={onClose}
            className="flex cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-1 text-muted"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text">Anthropic API key</span>
            {isNoKey && (
              <a
                href="https://console.anthropic.com/settings/keys"
                onClick={(e) => { e.preventDefault(); window.open('https://console.anthropic.com/settings/keys', '_blank'); }}
                className="cursor-pointer text-xs font-medium text-[#B86B60] no-underline"
              >
                Get a key &rarr;
              </a>
            )}
          </div>

          {(isNoKey || isEditing || isError) ? (
            <div
              className={`flex items-center rounded-lg border bg-cream px-3 py-2.5 ${
                isError ? 'border-accent' : 'border-[#E8E1D7]'
              }`}
            >
              <input
                ref={inputRef}
                type="text"
                className="flex-1 border-0 bg-transparent font-mono text-xs text-text outline-none"
                placeholder="«redacted:sk-…»…"
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
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#E8E1D7] bg-cream px-3 py-2.5"
              onClick={() => setMode('editing')}
            >
              <span className="flex-1 font-mono text-xs text-text">
                {settingsState?.maskedKey ?? ''}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF6E3] px-2 py-1 font-mono text-xs font-medium tracking-wide text-[#5A7A2F]">
                &#x2713; Connected
              </span>
            </div>
          )}

          {isNoKey && (
            <p className="m-0 text-xs leading-normal text-muted">
              Used to summarize your screen activity. Stored in your Mac&apos;s Keychain &mdash; never sent anywhere else.
            </p>
          )}
        </div>

        {isError && errorMessage && (
          <div className="flex gap-2.5 rounded-xl border border-accent bg-[#FBE9E7] px-3.5 py-3">
            <AlertCircleIcon />
            <span className="flex-1 text-xs leading-normal text-[#7A2E25]">
              {errorMessage}
            </span>
          </div>
        )}

        {isError && (
          <button
            onClick={() => { setMode('editing'); setErrorMessage(''); inputRef.current?.focus(); }}
            className="cursor-pointer border-0 bg-transparent p-0 text-center text-xs font-medium text-[#B86B60]"
          >
            Edit key &rarr;
          </button>
        )}

        {isNoKey && (
          <p className="m-0 font-serif text-xs italic text-subtle">
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
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={isValidating}
            className="w-full"
          >
            {isValidating ? (
              <>
                <Spinner />
                Verifying key&hellip;
              </>
            ) : (
              'Save'
            )}
          </Button>
        )}

        {isSaved && !hasKeyChanges && (
          <p className="m-0 text-center text-xs text-subtle">
            Models are fetched live from your Anthropic account.
          </p>
        )}
      </div>

      {toastMessage && <Toast message={toastMessage} onDone={dismissToast} />}
    </div>
  );
}
