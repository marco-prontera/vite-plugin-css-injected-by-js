import inlineCss from './dynamic-inline.css?inline';

export function mountDynamic() {
  const el = document.createElement('div');
  el.className = 'dynamic-inline-entry';
  el.textContent = 'Dynamic inline module loaded';
  document.body.appendChild(el);

  // Manually inject the ?inline CSS into a <style> tag
  const style = document.createElement('style');
  style.textContent = inlineCss;
  document.head.appendChild(style);
}
