import { useState, useEffect } from 'react';
import type { ScreenpipeFrame, DebugPipelineState, TimelineEntryIpc } from '@shared/ipc';

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#EFE8DD] bg-white p-4 space-y-3">
      <h2 className="text-xs font-bold text-[#BAA898] tracking-[1.4px] uppercase">{title}</h2>
      {children}
    </div>
  );
}

function Badge({ label, color = '#8B8477' }: { label: string; color?: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${color}15`, color }}
    >
      {label}
    </span>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export function DebugDashboard() {
  const [frames, setFrames] = useState<ScreenpipeFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pipelineState, setPipelineState] = useState<DebugPipelineState | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntryIpc[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);

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
        return combined.slice(-100);
      });
    });
    return unsub;
  }, []);

  async function handleCapture() {
    setLoading(true);
    setError(null);
    try {
      const result = await window.tomato.capture();
      if (result.error) {
        setError(result.error);
        setFrames([]);
      } else {
        setFrames(result.frames ?? []);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const poll = pipelineState?.currentPollState;
  const batch = pipelineState?.lastBatchResult;

  return (
    <div className="min-h-screen bg-[#FBF7F1] p-6 font-sans overflow-auto" style={{ userSelect: 'text' }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#2A2A2A] tracking-tight">
            Debug Dashboard
          </h1>
          <span className="text-xs font-mono text-[#8B8477]">screenpipe DB pipeline</span>
        </div>

        {/* Poll State */}
        <Panel title="Poll State">
          {poll ? (
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-[#2A2A2A]">{poll.activeApp || '—'}</span>
                <span className="text-[#8B8477]">&mdash; {poll.windowTitle || '—'}</span>
                <Badge
                  label={poll.screenpipeStatus}
                  color={poll.screenpipeStatus === 'ok' ? '#2E7D32' : '#E2574C'}
                />
              </div>
              <div className="text-xs text-[#BAA898]">
                Last tick: {formatTime(poll.timestamp)}
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8B8477]">No poll data yet. Start a session.</div>
          )}
        </Panel>

        {/* Live Timeline */}
        <Panel title={`Live Timeline (${timelineEntries.length} events)`}>
          {timelineEntries.length > 0 ? (
            <div className="space-y-1 max-h-80 overflow-auto font-mono text-xs">
              {[...timelineEntries].reverse().map((e, i) => (
                <div key={i} className="flex gap-2 py-1 border-b border-[#F0EAE2] last:border-0">
                  <span className="text-[#BAA898] shrink-0 w-16">{formatTime(e.timestamp)}</span>
                  <span className="text-[#2A2A2A] shrink-0">
                    {e.eventType === 'app_switch' ? '⇄' : e.eventType === 'clipboard' ? '📋' : '⌨'}
                  </span>
                  <span className="text-[#6B6259] shrink-0">{e.app}</span>
                  <span className="text-[#BAA898]">→</span>
                  <span className="text-[#8B8477] truncate">{e.window}</span>
                  {e.browserUrl && (
                    <span className="text-[#5C6BC0] truncate">🔗 {e.browserUrl}</span>
                  )}
                  {e.typedText && (
                    <span className="text-[#2A2A2A] truncate ml-auto">&ldquo;{e.typedText}&rdquo;</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-[#8B8477]">No activity yet. Start a session and type something.</div>
          )}
        </Panel>

        {/* Last Batch Result */}
        <Panel title="Last Batch Summary">
          {batch ? (
            <div className="space-y-2 text-sm">
              <div className="text-[#2A2A2A]">{batch.summary}</div>
              <div className="flex gap-2">
                <Badge label={batch.level2Classification} color="#5C6BC0" />
                <Badge
                  label={batch.isDrifting ? 'Drifting' : 'On track'}
                  color={batch.isDrifting ? '#E2574C' : '#2E7D32'}
                />
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#8B8477]">No batch summary yet. First one runs after 3 minutes.</div>
          )}
        </Panel>

        {/* LLM State */}
        <Panel title="LLM State">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#2A2A2A]">Pending call:</span>
              <Badge
                label={pipelineState?.pendingLlmCall ? 'Yes' : 'No'}
                color={pipelineState?.pendingLlmCall ? '#F0A020' : '#8B8477'}
              />
            </div>
            {pipelineState?.lastLlmPromptPreview && (
              <div>
                <button
                  onClick={() => setShowPrompt(!showPrompt)}
                  className="text-xs text-[#E2574C] font-semibold hover:underline"
                >
                  {showPrompt ? 'Hide' : 'Show'} last prompt
                </button>
                {showPrompt && (
                  <pre className="mt-2 text-xs text-[#6B6259] font-mono whitespace-pre-wrap break-words bg-[#FBF7F1] rounded-lg p-3 border border-[#EFE8DD] max-h-60 overflow-auto">
                    {pipelineState.lastLlmPromptPreview}
                  </pre>
                )}
              </div>
            )}
          </div>
        </Panel>

        {/* Raw Screenpipe Capture */}
        <Panel title="Raw Screenpipe Capture">
          <button
            onClick={handleCapture}
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all
              bg-[#E2574C] text-white shadow-[0_4px_14px_rgba(226,87,76,0.25)]
              hover:bg-[#D04A3F] hover:shadow-[0_6px_18px_rgba(226,87,76,0.35)]
              disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Capturing...' : 'Capture Latest Frames'}
          </button>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {frames.length > 0 && (
            <div className="space-y-2">
              {frames.map((frame, i) => (
                <div key={i} className="rounded-lg border border-[#EFE8DD] bg-[#FBF7F1] p-3 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#E2574C]" />
                    <span className="font-mono text-sm font-semibold text-[#2A2A2A]">{frame.app}</span>
                    <span className="text-xs text-[#8B8477]">&mdash; {frame.window}</span>
                    {frame.focused && <Badge label="focused" color="#2E7D32" />}
                  </div>
                  <div className="text-[10px] text-[#BAA898]">
                    {new Date(frame.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
