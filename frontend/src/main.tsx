import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './i18n'; // NOTE: i18next 国际化初始化
import { initTheme } from './hooks/useTheme';

// NOTE: 在 React 渲染前同步初始化主题，防止浅色→深色闪烁
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
