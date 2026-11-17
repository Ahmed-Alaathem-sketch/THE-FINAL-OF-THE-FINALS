import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'virtual:brand-fonts.css';
import './ui/styles/app.css';
import App from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
