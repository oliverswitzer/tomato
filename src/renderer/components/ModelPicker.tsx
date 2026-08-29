import type { ModelInfo } from '@shared/ipc';
import { getModelPricing, formatTokenCost } from '../../config/model-pricing';

function ChevronIcon({ direction, color = '#8B8477' }: { direction: 'up' | 'down'; color?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points={direction === 'up' ? '18,15 12,9 6,15' : '6,9 12,15 18,9'} />
    </svg>
  );
}

export function formatModelName(modelId: string): string {
  const match = modelId.match(/^claude-(\d+(?:\.\d+)?-)?(.*?)(-\d{8})?$/);
  if (!match) {
    const parts = modelId.split('-');
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }
  const family = match[2] ?? modelId;
  const version = match[1]?.replace(/-$/, '') ?? '';
  const name = family.charAt(0).toUpperCase() + family.slice(1);
  return version ? `Claude ${name} ${version}` : `Claude ${name}`;
}

function ModelCostLabel({ model }: { model: ModelInfo }) {
  const pricing = getModelPricing(model.id);
  const input = pricing?.inputPer1M ?? model.inputPer1M;
  const output = pricing?.outputPer1M ?? model.outputPer1M;
  if (input == null || output == null) {
    return <span className="font-mono text-xs text-muted">{model.priceTier}</span>;
  }
  return (
    <span className="font-mono text-xs text-muted">
      {formatTokenCost({ id: model.id, inputPer1M: input, outputPer1M: output })}
    </span>
  );
}

interface ModelPickerProps {
  models: ModelInfo[];
  selectedModel: string | null;
  onSelect: (modelId: string) => void;
  open: boolean;
  onToggle: () => void;
  error?: string;
}

export function ModelPicker({ models, selectedModel, onSelect, open, onToggle, error }: ModelPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-text">Model</span>

      <div
        onClick={onToggle}
        className={`flex cursor-pointer items-center justify-between border px-3 py-2.5 ${
          open ? 'rounded-t-lg border-accent bg-white' : 'rounded-lg border-[#E8E1D7] bg-cream'
        }`}
      >
        <span className={`text-xs text-text ${open ? 'font-medium' : 'font-normal'}`}>
          {selectedModel ? formatModelName(selectedModel) : 'Select a model'}
        </span>
        <ChevronIcon direction={open ? 'up' : 'down'} color={open ? '#E2574C' : '#8B8477'} />
      </div>

      {open && (
        <div className="-mt-2 rounded-b-lg border border-t-0 border-accent bg-white py-1 shadow-[0_8px_18px_rgba(0,0,0,0.09)]">
          {models.length > 0 ? (
            models.map((m) => (
              <div
                key={m.id}
                onClick={() => onSelect(m.id)}
                className={`flex cursor-pointer items-center justify-between px-3 py-2.5 ${
                  m.id === selectedModel ? 'bg-[#FFF5F4]' : 'bg-transparent'
                }`}
              >
                <span className={`text-xs text-text ${m.id === selectedModel ? 'font-semibold' : 'font-medium'}`}>
                  {formatModelName(m.id)}
                </span>
                <ModelCostLabel model={m} />
              </div>
            ))
          ) : (
            <div className="px-3 py-2.5 text-center">
              <span className="font-serif text-xs italic text-subtle">
                {error || 'Loading models…'}
              </span>
            </div>
          )}
        </div>
      )}

      {!open && (
        <p className="m-0 font-serif text-xs italic text-muted">
          {error || 'Haiku is recommended for the cheapest summaries.'}
        </p>
      )}
    </div>
  );
}
