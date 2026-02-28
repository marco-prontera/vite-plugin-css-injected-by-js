import './style.css';
import { injectCSS } from 'virtual:css-injected-by-js';

const app = document.querySelector('#app');
if (app) {
  app.textContent = 'Shadow next fixture loaded';
}

// Create a Web Component with a ShadowRoot and inject CSS into it
const host = document.createElement('div');
const shadowRoot = host.attachShadow({ mode: 'open' });

const shadowContent = document.createElement('div');
shadowContent.className = 'shadow-next-inner';
shadowContent.textContent = 'Shadow next content';
shadowRoot.appendChild(shadowContent);

document.body.appendChild(host);

// Use the virtual module to inject all bundled CSS into the ShadowRoot
injectCSS({ target: shadowRoot });
