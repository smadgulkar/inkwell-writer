import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, applyTheme } from './ui/App';
import { store } from './store/store';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

// Set the theme before the first paint so the app never flashes the wrong colors.
applyTheme(store.get().ui.theme);
document.documentElement.classList.add(`prose-face-${store.get().ui.proseFont}`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
