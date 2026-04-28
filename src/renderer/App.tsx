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

function getRoute(): string {
  return window.location.hash.slice(1) || '/start';
}

export function App() {
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (route !== '/start' || window.location.hash) return;
    window.tomato.getOnboardingState().then((state) => {
      if (!state.hasApiKey && !state.wasSkipped) {
        window.location.hash = '/api-key';
      }
    });
  }, [route]);

  const Page = pages[route] ?? StartPage;
  return <Page />;
}
