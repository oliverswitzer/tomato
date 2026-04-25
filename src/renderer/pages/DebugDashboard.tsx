import { useState } from 'react';
import type { ScreenpipeFrame } from '@shared/ipc';

export function DebugDashboard() {
  const [frames, setFrames] = useState<ScreenpipeFrame[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-[#FBF7F1] p-6 font-sans overflow-auto" style={{ userSelect: 'text' }}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[#2A2A2A] tracking-tight">
            Debug Dashboard
          </h1>
          <span className="text-xs font-mono text-[#8B8477]">screenpipe debugger</span>
        </div>

        <button
          onClick={handleCapture}
          disabled={loading}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all
            bg-[#E2574C] text-white shadow-[0_4px_14px_rgba(226,87,76,0.25)]
            hover:bg-[#D04A3F] hover:shadow-[0_6px_18px_rgba(226,87,76,0.35)]
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Capturing...' : 'Capture Latest Frames'}
        </button>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {frames.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-[#BAA898] tracking-[1.4px] uppercase">
              Captured Frames ({frames.length})
            </h2>
            {frames.map((frame, i) => (
              <div
                key={i}
                className="rounded-2xl border border-[#EFE8DD] bg-white p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E2574C]" />
                  <span className="font-mono text-sm font-semibold text-[#2A2A2A]">
                    {frame.app}
                  </span>
                  <span className="text-xs text-[#8B8477]">
                    &mdash; {frame.window}
                  </span>
                  {frame.focused && (
                    <span className="ml-auto text-[10px] font-semibold text-[#2E7D32] bg-[#E8F5E9] px-2 py-0.5 rounded-full">
                      focused
                    </span>
                  )}
                </div>
                <pre className="text-xs text-[#6B6259] whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-auto">
                  {frame.text}
                </pre>
                <div className="text-[10px] text-[#BAA898]">
                  {new Date(frame.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}

        {frames.length === 0 && !error && !loading && (
          <div className="text-center py-12 text-sm text-[#8B8477]">
            Click "Capture" to fetch the latest screenpipe frames.
          </div>
        )}
      </div>
    </div>
  );
}
