import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { hydratePersonaFromStorageOnce } from '@/lib/personaPersist';
import './styles.css';
import './kawaii.css';

hydratePersonaFromStorageOnce();

const root = document.getElementById('root');
if (!root) throw new Error('root element missing');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
