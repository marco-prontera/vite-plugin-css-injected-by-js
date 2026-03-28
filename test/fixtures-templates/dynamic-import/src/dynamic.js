import './dynamic.css';

export function mountDynamic() {
  const el = document.createElement('div');
  el.className = 'dynamic-entry';
  el.textContent = 'Dynamic module loaded';
  document.body.appendChild(el);
}
