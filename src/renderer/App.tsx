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

export function App() {
  const hash = window.location.hash.slice(1) || '/start';
  const Page = pages[hash] ?? StartPage;
  return <Page />;
}
