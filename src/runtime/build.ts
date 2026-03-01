import { InjectCSSOptions } from "virtual:css-injected-by-js";

declare global {
    // You MUST use 'var' here so TypeScript maps it to globalThis
    var __VITE_CSS_INJECT_OPTS__: any; // Or use InjectCSSOptions if imported
    var __VITE_CSS_QUEUE__: ((opts: any) => void)[] | undefined;
    var __VITE_CSS_EXECUTED__: ((opts: any) => void)[] | undefined;
    var __VITE_CSS_ELS__: { el: HTMLElement; target?: HTMLElement | ShadowRoot }[] | undefined;
    var __VITE_CSS_RAW__: string | undefined;
    var __VITE_CSS_REMOVED__: boolean | undefined;
}

export function injectCSS(opts: InjectCSSOptions) {
  if (typeof globalThis === 'undefined') return;
  globalThis.__VITE_CSS_INJECT_OPTS__ = opts || {};
  
  var q = globalThis.__VITE_CSS_QUEUE__ || [];
  var exec = globalThis.__VITE_CSS_EXECUTED__ || [];
  
  /* 1. Run already loaded chunks for the given target */
  for (var i = 0; i < exec.length; i++) {
    exec[i](opts || {});
  }
  
  /* 2. Run new chunks and move them to executed */
  for (var i = 0; i < q.length; i++) {
    q[i](opts || {});
    exec.push(q[i]);
  }
  
  globalThis.__VITE_CSS_QUEUE__ = [];
  globalThis.__VITE_CSS_EXECUTED__ = exec;
}

export function removeCSS(opts: InjectCSSOptions) {
  if (typeof globalThis === 'undefined') return;
  var els = globalThis.__VITE_CSS_ELS__ || [];
  var target = opts && opts.target;
  
  for (var i = 0; i < els.length; i++) {
    var item = els[i];
    if (target) {
      /* Only remove if it matches the requested target */
      if (item.target === target && item.el.parentNode) {
        item.el.parentNode.removeChild(item.el);
      }
    } else {
      /* Global removal: rip out everything */
      if (item.el.parentNode) {
        item.el.parentNode.removeChild(item.el);
      }
    }
  }
}

export function getRawCSS() {
  if (typeof globalThis === 'undefined') return '';
  return globalThis.__VITE_CSS_RAW__ || '';
}