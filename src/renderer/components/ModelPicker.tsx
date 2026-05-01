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
    return <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: '#8B8477' }}>{model.priceTier}</span>;
  }
  return (
    <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: '#8B8477' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, color: '#2A2A2A' }}>
        Model
      </span>

      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: open ? '#FFFFFF' : '#FBF7F1',
          borderRadius: open ? '8px 8px 0 0' : 8,
          border: `1px solid ${open ? '#E2574C' : '#E8E1D7'}`,
          padding: '10px 12px',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: open ? 500 : 400, color: '#2A2A2A' }}>
          {selectedModel ? formatModelName(selectedModel) : 'Select a model'}
        </span>
        <ChevronIcon direction={open ? 'up' : 'down'} color={open ? '#E2574C' : '#8B8477'} />
      </div>

      {open && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: '0 0 8px 8px',
            border: '1px solid #E2574C',
            borderTop: 'none',
            boxShadow: '0 8px 18px rgba(0,0,0,0.09)',
            padding: '4px 0',
            marginTop: -8,
          }}
        >
          {models.length > 0 ? (
            models.map((m) => (
              <div
                key={m.id}
                onClick={() => onSelect(m.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  background: m.id === selectedModel ? '#FFF5F4' : 'transparent',
                }}
              >
                <span style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: 12,
                  fontWeight: m.id === selectedModel ? 600 : 500,
                  color: '#2A2A2A',
                }}>
                  {formatModelName(m.id)}
                </span>
                <ModelCostLabel model={m} />
              </div>
            ))
          ) : (
            <div style={{ padding: '10px 12px', textAlign: 'center' }}>
              <span style={{
                fontFamily: "'Newsreader', Georgia, serif",
                fontSize: 11,
                fontStyle: 'italic',
                color: '#A89F94',
              }}>
                {error || 'Loading models…'}
              </span>
            </div>
          )}
        </div>
      )}

      {!open && (
        <p
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: 12,
            fontStyle: 'italic',
            color: '#8B8477',
            margin: 0,
          }}
        >
          {error || 'Haiku is recommended for the cheapest summaries.'}
        </p>
      )}
    </div>
  );
}
