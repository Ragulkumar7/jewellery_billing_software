import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { SilverRateProvider } from './lib/silver-rate-context';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SilverRateProvider>
      <App />
    </SilverRateProvider>
  </StrictMode>
);
