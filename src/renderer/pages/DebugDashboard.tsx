import { useState, useEffect } from 'react';
import type { DebugPipelineState, TimelineEntryIpc, BatchHistoryEntry } from '@shared/ipc';

const badgeColors: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-600',
  drift: 'bg-red-100 text-red-600',
  'on-track': 'bg-green-100 text-green-800',
  category: 'bg-indigo-100 text-indigo-600',
  pending: 'bg-amber-100 text-amber-600',
  muted: 'bg-stone-100 text-stone-500',
  passive: 'bg-purple-100 text-purple-700',
};

function Badge({ label, variant }: { label: string; variant: string }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeColors[variant] ?? badgeColors.muted}`}>
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function Expandable({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-start gap-1 w-full text-left font-mono text-[11px] text-stone-600 hover:text-stone-900 bg-transparent border-none p-0 cursor-pointer"
      >
        <span className="text-[9px] shrink-0 mt-0.5 w-2.5">{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && <div className="mt-1 ml-3.5 pl-2.5 border-l-2 border-stone-200">{children}</div>}
    </div>
  );
}

function TimelineEntryRow({ entry }: { entry: TimelineEntryIpc }) {
  const icon = entry.eventType === 'app_switch' ? '⇄'
    : entry.eventType === 'clipboard' ? '📋'
    : entry.eventType === 'passive' ? '👁'
    : '⌨';

  const label = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="font-mono text-[11px] text-stone-400 shrink-0 w-[70px]">{formatTime(entry.timestamp)}</span>
      <span className="shrink-0 text-xs">{icon}</span>
      <Badge label={entry.eventType} variant={entry.eventType === 'passive' ? 'passive' : 'muted'} />
      <span className="text-[11px] text-stone-600 shrink-0">{entry.app}</span>
      <span className="text-[11px] text-stone-400 truncate min-w-0">{entry.window}</span>
    </span>
  );

  return (
    <div className="py-1 border-b border-stone-100 last:border-b-0 font-mono text-xs">
      <Expandable label={label}>
        <pre className="font-mono text-[11px] text-stone-600 bg-stone-50 border border-stone-200 rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto mt-1">
          {JSON.stringify(entry, null, 2)}
        </pre>
      </Expandable>
    </div>
  );
}

function BatchHistoryRow({ entry }: { entry: BatchHistoryEntry }) {
  const [showPrompt, setShowPrompt] = useState(false);

  const label = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span className="font-mono text-[11px] text-stone-400 shrink-0 w-[70px]">{formatTime(entry.timestamp)}</span>
      <Badge label={entry.level2Classification} variant="category" />
      <Badge
        label={entry.isDrifting ? `Drift ${Math.round(entry.confidence * 100)}%` : 'On track'}
        variant={entry.isDrifting ? 'drift' : 'on-track'}
      />
      <span className="text-[11px] text-stone-600 truncate min-w-0">{entry.summary}</span>
    </span>
  );

  return (
    <div className="py-1.5 border-b border-stone-100 last:border-b-0 font-mono text-xs">
      <Expandable label={label}>
        <div className="font-mono text-[11px] mb-0.5">
          <span className="text-stone-400">summary: </span>
          <span className="text-stone-900">{entry.summary}</span>
        </div>
        <div className="font-mono text-[11px] mb-0.5">
          <span className="text-stone-400">drift reason: </span>
          <span className="text-stone-900">{entry.reason}</span>
        </div>
        <div className="mt-1.5">
          <button
            onClick={() => setShowPrompt(!showPrompt)}
            className="bg-transparent border-none p-0 cursor-pointer font-mono text-[11px] font-semibold text-red-500 hover:underline"
          >
            {showPrompt ? 'Hide' : 'Show'} full prompt
          </button>
          {showPrompt && (
            <pre className="font-mono text-[11px] text-stone-600 bg-stone-50 border border-stone-200 rounded-lg p-2.5 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto mt-1">
              {entry.prompt}
            </pre>
          )}
        </div>
      </Expandable>
    </div>
  );
}

export function DebugDashboard() {
  const [pipelineState, setPipelineState] = useState<DebugPipelineState | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntryIpc[]>([]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const state = await window.tomato.getDebugPipelineState();
      if (state) setPipelineState(state);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsub = window.tomato.onTimelineUpdate((entries) => {
      setTimelineEntries((prev) => {
        const combined = [...prev, ...entries];
        return combined.slice(-200);
      });
    });
    return unsub;
  }, []);

  const batchHistory = pipelineState?.batchHistory ?? [];

  return (
    <div className="min-h-screen bg-[#FBF7F1] p-6 font-sans overflow-auto" style={{ userSelect: 'text' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-stone-800 tracking-tight">Debug Dashboard</h1>
          <span className="text-[11px] font-mono text-stone-400">screenpipe pipeline</span>
        </div>

        {/* Live Timeline */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-3">
          <h2 className="text-[10px] font-bold text-stone-400 tracking-wider uppercase mb-2.5">
            Live Timeline ({timelineEntries.length} events)
          </h2>
          {timelineEntries.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto">
              {[...timelineEntries].reverse().map((e, i) => (
                <TimelineEntryRow key={i} entry={e} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-stone-400">No activity yet. Start a session.</div>
          )}
        </div>

        {/* Batch History */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-3">
          <h2 className="text-[10px] font-bold text-stone-400 tracking-wider uppercase mb-2.5">
            Batch History ({batchHistory.length} summaries)
          </h2>
          {batchHistory.length > 0 ? (
            <div className="max-h-[500px] overflow-y-auto">
              {[...batchHistory].reverse().map((entry, i) => (
                <BatchHistoryRow key={i} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="text-sm text-stone-400">No batch summaries yet. First one runs after ~60 seconds.</div>
          )}
        </div>

        {/* LLM State */}
        <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-3">
          <h2 className="text-[10px] font-bold text-stone-400 tracking-wider uppercase mb-2.5">LLM State</h2>
          <div className="flex items-center gap-2 text-sm text-stone-800">
            Pending call:
            <Badge
              label={pipelineState?.pendingLlmCall ? 'Yes' : 'No'}
              variant={pipelineState?.pendingLlmCall ? 'pending' : 'muted'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
