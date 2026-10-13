import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createMockApi } from './mock/api';
import './styles.css';

document.documentElement.lang = 'en';
// Inside Electron the preload provides window.loadout. In a plain browser, installs are simulated.
const api = window.loadout ?? createMockApi();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
