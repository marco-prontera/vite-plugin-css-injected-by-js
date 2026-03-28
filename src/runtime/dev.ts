import { InjectCSSOptions } from "virtual:css-injected-by-js";

var _cssEnabled = false;
var _styleCache = new Set<HTMLElement>();
var _observer: MutationObserver | null = null;

function _observe() {
  if (_observer && typeof document !== 'undefined') {
    _observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}

if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach(function(n) {
    n.setAttribute('media', 'not all');
    _styleCache.add(n as HTMLElement);
  });

  _observer = new MutationObserver(function(muts) {
    if (_cssEnabled) return;
    muts.forEach(function(m) {
      m.addedNodes.forEach(function(n: Node) {
        if (n.nodeType === 1 && (n as HTMLElement).tagName === 'STYLE' && (n as HTMLElement).hasAttribute('data-vite-dev-id')) {
          (n as HTMLElement).setAttribute('media', 'not all');
          _styleCache.add(n as HTMLElement);
        }
      });
    });
  });

  _observe();
}

export function injectCSS(opts: InjectCSSOptions = {}): void {
  _cssEnabled = true;
  if (_observer) _observer.disconnect();
  if (typeof document === 'undefined') return;
  var target = (opts && opts.target) || document.head;
  _styleCache.forEach(function(n) {
    n.removeAttribute('media');
    if (target !== document.head) {
      target.appendChild(n);
    }
  });
}

export function removeCSS(opts: InjectCSSOptions = {}): void {
  _cssEnabled = false;
  var target = opts && opts.target;
  
  _styleCache.forEach(function(n: HTMLElement) {
    if (target) {
      /* Only mute if it was moved to this specific target */
      if (n.parentNode === target) n.setAttribute('media', 'not all');
    } else {
      /* Global mute */
      n.setAttribute('media', 'not all');
    }
  });
  _observe();
}

export function getRawCSS() {
  return '';
}