import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@qsimcity/ui';
import { registerServiceWorker } from './pwa.js';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
