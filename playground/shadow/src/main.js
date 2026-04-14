import inlineCss from './index.css?inline';
import './index.css';

const app = document.querySelector('#app');
if (app) {
  app.textContent = 'Shadow fixture loaded';
}

const host = document.createElement('div');
const shadowRoot = host.attachShadow({ mode: 'open' });
const styleTag = document.createElement('style');
styleTag.textContent = inlineCss;
shadowRoot.appendChild(styleTag);

const shadowContent = document.createElement('div');
shadowContent.className = 'shadow-inline-css';
shadowContent.textContent = 'Shadow content';
shadowRoot.appendChild(shadowContent);

document.body.appendChild(host);
