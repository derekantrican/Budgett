import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import './utils/extensionHost';

// Expose the host's single React/ReactDOM instance so extension bundles can mark them as
// external instead of bundling their own copy — critical since extension components render
// inside the host's own tree, and a second React copy would break hooks.
window.React = React;
window.ReactDOM = ReactDOM;

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Unregister any previously installed service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}
