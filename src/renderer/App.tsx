import { useState, useEffect } from 'react';
import { StartPage } from './pages/StartPage';
import { HudPage } from './pages/HudPage';
import { NudgePage } from './pages/NudgePage';
import { DebugDashboard } from './pages/DebugDashboard';
import { PermissionsPage } from './pages/PermissionsPage';
import { ApiKeyPage } from './pages/ApiKeyPage';
import { SettingsPage } from './pages/SettingsPage';
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
  return window.location.hash.slice(1) || '/start';
}

export function App() {
  const hashRoute = getHashRoute();
  const needsOnboardingCheck = hashRoute === '/start';
  const [route, setRoute] = useState(needsOnboardingCheck ? '' : hashRoute);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () => setRoute(getHashRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!needsOnboardingCheck) return;
    window.tomato.getOnboardingState().then((state) => {
      setRoute(state.hasApiKey ? '/start' : '/api-key');
    });
  }, []);

  useEffect(() => {
    return window.tomato.onShowSettings(() => setSettingsOpen(true));
  }, []);

  if (!route) return null;

  const Page = pages[route] ?? StartPage;
  return (
    <>
      <Page />
      {settingsOpen && (
        <SettingsPage onClose={() => setSettingsOpen(false)} />
      )}
    </>
  );
}
