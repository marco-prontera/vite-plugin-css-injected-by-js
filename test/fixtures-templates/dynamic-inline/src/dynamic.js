import './dynamic-inline.css';
import { injectCSS, removeCSS } from 'virtual:css-injected-by-js';

export function mountDynamic() {
  const el = document.createElement('div');
  el.className = 'dynamic-inline-entry';
  el.textContent = 'Dynamic inline module loaded';
  document.body.appendChild(el);

 const btn = document.createElement('button');
    btn.textContent = 'Click me to inject CSS from dynamic module';
    btn.addEventListener('click', injectCSS);
    el.appendChild(btn);

    const removeCssBtn = document.createElement('button');
    removeCssBtn.textContent = 'Click me to remove injected CSS from dynamic module';
    removeCssBtn.addEventListener('click', removeCSS);
    el.appendChild(removeCssBtn);
}
