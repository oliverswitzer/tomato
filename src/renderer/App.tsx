import { useState, useEffect } from 'react';
import { StartPage } from './pages/StartPage';
import { HudPage } from './pages/HudPage';
import { NudgePage } from './pages/NudgePage';
import { DebugDashboard } from './pages/DebugDashboard';
import { PermissionsPage } from './pages/PermissionsPage';
import { ApiKeyPage } from './pages/ApiKeyPage';
import type { ComponentType } from 'react';

const pages: Record<string, ComponentType> = {
  '/start': StartPage,
  '/hud': HudPage,
  '/nudge': NudgePage,
  '/debug': DebugDashboard,
  '/permissions': PermissionsPage,
  '/api-key': ApiKeyPage,
};

function getHashRoute(): string {
  return window.location.hash.slice(1) || '';
}

export function App() {
  const [route, setRoute] = useState(getHashRoute);
  const [ready, setReady] = useState(!!getHashRoute());

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getHashRoute());
      setReady(true);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (ready) return;
    window.tomato.getOnboardingState().then((state) => {
      if (!state.hasApiKey && !state.wasSkipped) {
        setRoute('/api-key');
      } else {
        setRoute('/start');
      }
      setReady(true);
    });
  }, [ready]);

  if (!ready) return null;

  const Page = pages[route] ?? StartPage;
  return <Page />;
}
