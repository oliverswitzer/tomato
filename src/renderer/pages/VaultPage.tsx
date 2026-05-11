import { useState, useEffect } from 'react';
import { relativeDate } from '@shared/utils';
import type { VaultItem } from '@shared/ipc';

export function VaultPage() {
  const [items, setItems] = useState<VaultItem[]>([]);

  useEffect(() => {
    window.tomato.getVaultItems().then(setItems);
  }, []);

  function handleDelete(id: string) {
    window.tomato.deleteVaultItem(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  return (
    <div style={{
      padding: '24px 20px',
      fontFamily: 'Inter, sans-serif',
      maxHeight: '100vh',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <a
          href="#/start"
          style={{
            fontSize: 18,
            color: '#6B5B4F',
            textDecoration: 'none',
            lineHeight: 1,
          }}
        >&larr;</a>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2A2A2A', margin: 0 }}>
          Idea Vault
        </h1>
      </div>

      {items.length === 0 ? (
        <div style={{
          textAlign: 'center',
          color: '#8B8477',
          fontSize: 14,
          lineHeight: 1.6,
          padding: '40px 20px',
        }}>
          No saved ideas yet. When you drift during a session, press &ldquo;Save Idea&rdquo; to capture what you were exploring.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                background: '#FAF8F5',
                borderRadius: 12,
                padding: '14px 16px',
                border: '1px solid #EDE8E0',
              }}
            >
              <div style={{ fontSize: 14, color: '#2A2A2A', lineHeight: 1.5, marginBottom: 8 }}>
                {item.ideaSummary}
              </div>

              {item.apps.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {item.apps.map((app) => (
                    <span key={app} style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 99,
                      background: '#EDE8E0',
                      color: '#6B5B4F',
                    }}>{app}</span>
                  ))}
                </div>
              )}

              {item.urls.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  {item.urls.map((url) => (
                    <div key={url} style={{
                      fontSize: 11,
                      color: '#7C6B5E',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{url}</div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#8B8477' }}>
                    While working on: {item.sessionIntention}
                  </div>
                  <div style={{ fontSize: 11, color: '#BAA898', marginTop: 2 }}>
                    {relativeDate(item.savedAt)}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 4,
                    fontSize: 14,
                    color: '#BAA898',
                    lineHeight: 1,
                  }}
                  title="Delete idea"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3,6 5,6 21,6" />
                    <path d="M19,6 L19,20 C19,21.1 18.1,22 17,22 L7,22 C5.9,22 5,21.1 5,20 L5,6" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
