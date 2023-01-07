import { test, expect, vi } from 'vitest';
import { buildCSSInjectionCode } from './utils';

const onerror = vi.fn();
window.onerror = onerror;

test('Generate JS that applies styles', async () => {
    const styleId = `style-${Date.now()}`;
    const output = await buildCSSInjectionCode('body { color: red; }', styleId);

    /* Add Default Supported Nonce To Page */
    const $nonceMeta = document.createElement('meta');
    $nonceMeta.setAttribute('property', 'csp-nonce');
    $nonceMeta.content = 'nonce-1234';
    document.head.appendChild($nonceMeta);

    const $script = document.createElement('script');
    $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
    document.head.appendChild($script);

    // Doesn't error
    expect(onerror).not.toBeCalled();

    // StyleId applied
    const $styleElem = document.head.querySelector<HTMLStyleElement>(`style#${styleId}`);
    expect($styleElem).not.toBeNull();
    expect($styleElem!.nonce).toBe('nonce-1234');

    // Applied style!
    expect(getComputedStyle(document.body).color).toBe('red');
});

test('Generate JS, with custom nonce', async () => {
    const styleId = `style-custom-${Date.now()}`;

    /* Add Default Supported Nonce To Page */
    const $nonceMeta = document.createElement('meta');
    $nonceMeta.setAttribute('name', 'custom-nonce');
    $nonceMeta.content = 'custom-nonce-1234';
    document.head.appendChild($nonceMeta);

    const getCustomNonce = () => {
        return document.querySelector<HTMLMetaElement>('meta[name=custom-nonce]')?.content;
    };

    const output = await buildCSSInjectionCode('body { color: red; }', styleId, undefined, getCustomNonce);

    const $script = document.createElement('script');
    $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
    document.head.appendChild($script);

    // Custom Nonce!
    const $styleElem = document.head.querySelector<HTMLStyleElement>(`style#${styleId}`);
    expect($styleElem!.nonce).toBe('custom-nonce-1234');
});
