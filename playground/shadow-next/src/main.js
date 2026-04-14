import './style.css';
import { injectCSS, removeCSS } from 'virtual:css-injected-by-js';

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
const shadowBtn = document.createElement('button');
shadowBtn.textContent = 'Click me to remove injected CSS';
shadowBtn.addEventListener('click', () => {
  removeCSS({ target: shadowRoot });
});
const shadowAddCss = document.createElement('button');
shadowAddCss.textContent = 'Click me to re-inject CSS';
shadowAddCss.addEventListener('click', () => {
  injectCSS({ target: shadowRoot });
});
shadowRoot.appendChild(shadowContent);
shadowRoot.appendChild(shadowBtn);
shadowRoot.appendChild(shadowAddCss);

document.body.appendChild(host);

// Use the virtual module to inject all bundled CSS into the ShadowRoot
//injectCSS({ target: shadowRoot });
