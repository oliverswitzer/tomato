import './NudgePage.css';
import { useSessionStore } from '../store/sessionStore';

export function NudgePage() {
  const intention = useSessionStore((s) => s.state.intention);

  const nudgeText = intention
    ? `I noticed you don't seem to be working on "${intention}" right now.`
    : "I noticed you don't seem to be working on your focus task right now.";

  return (
    <div id="bubble">
      <div className="bubble-text">{nudgeText}</div>
      <div className="bubble-buttons">
        <button
          className="bubble-btn secondary"
          onClick={() => window.tomato.nudgePause()}
        >
          Pause session
        </button>
        <button
          className="bubble-btn primary"
          onClick={() => window.tomato.nudgeRefocus()}
        >
          Refocus
        </button>
      </div>
    </div>
  );
}
