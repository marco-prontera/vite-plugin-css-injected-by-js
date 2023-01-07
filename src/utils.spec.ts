import { test, expect, vi } from 'vitest';
import { buildCSSInjectionCode } from './utils';

const onerror = vi.fn();
window.onerror = onerror;

test('Generate JS that applies styles', async () => {
    const styleId = `style-${Date.now()}`;
    const output = await buildCSSInjectionCode('body { color: red; }', styleId);

    const $script = document.createElement('script');
    $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
    document.head.appendChild($script);

    // Doesn't error
    expect(onerror).not.toBeCalled();

    // StyleId applied
    expect(document.head.querySelector(`style#${styleId}`)).not.toBeNull();

    // Applied style!
    expect(getComputedStyle(document.body).color).toBe('red');
});
