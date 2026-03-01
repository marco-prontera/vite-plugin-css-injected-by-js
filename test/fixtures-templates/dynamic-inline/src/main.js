import style from './base.css?inline';

const app = document.querySelector('#app');
if (app) {
  app.textContent = 'Dynamic inline fixture loaded';
}

const btn = document.createElement('button');
btn.textContent = 'Click me to inject CSS';
btn.addEventListener('click', () => {
  const styleEl = document.createElement('style');
  styleEl.textContent = style;
  document.head.appendChild(styleEl);
});
app.appendChild(btn);

import('./dynamic.js').then(({ mountDynamic }) => {
  mountDynamic();
});
