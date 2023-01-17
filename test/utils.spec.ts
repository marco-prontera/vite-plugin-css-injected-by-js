import { test, expect, vi, beforeAll } from 'vitest';
import { buildCSSInjectionCode, removeLinkStyleSheets } from '../src/utils';

const onerror = vi.fn();
window.onerror = onerror;

beforeAll(() => {
    const $meta = document.createElement('meta');
    $meta.setAttribute('property', 'csp-nonce');
    $meta.setAttribute('content', 'abc-123');
    document.head.prepend($meta);
});

test('Generate JS that applies styles', async () => {
    const styleId = `style-${Date.now()}`;
    const output = await buildCSSInjectionCode({
        cssToInject: 'body { color: red; }',
        styleId,
    });

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

test('Generate JS that applies styles, without styleId', async () => {
    const output = await buildCSSInjectionCode({
        cssToInject: 'body { color: red; }',
    });

    const $script = document.createElement('script');
    $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
    document.head.appendChild($script);

    // Doesn't error
    expect(onerror).not.toBeCalled();

    // StyleId applied
    expect(document.head.querySelector(`style`)).not.toBeNull();

    // Applied style!
    expect(getComputedStyle(document.body).color).toBe('red');
});

test('Generate JS that applies styles, with a nonce', async () => {
    const styleId = `style-${Date.now()}`;
    const output = await buildCSSInjectionCode({
        cssToInject: 'body { color: red; }',
        styleId,
        useStrictCSP: true,
    });

    const $script = document.createElement('script');
    $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
    document.head.appendChild($script);

    // Doesn't error
    expect(onerror).not.toBeCalled();

    // StyleId applied
    const $style = document.head.querySelector(`style#${styleId}`);
    expect($style).not.toBeNull();

    // Applied style!
    expect(getComputedStyle(document.body).color).toBe('red');

    // @ts-ignore
    expect($style?.nonce).toBe('abc-123');
});

test('Generate JS that applies styles from custom code', async () => {
    const styleId = `style-custom-${Date.now()}`;
    const output = await buildCSSInjectionCode({
        cssToInject: 'body { color: red; }',
        styleId,
        injectCodeFunction: (css) => {
            const $style = document.createElement('style');
            $style.setAttribute('custom-style', '');
            $style.appendChild(document.createTextNode(css));
            document.head.appendChild($style);
        },
    });

    const $script = document.createElement('script');
    $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
    document.head.appendChild($script);

    // Doesn't error
    expect(onerror).not.toBeCalled();

    // Custom attribute added
    expect(document.head.querySelector(`style[custom-style]`)).not.toBeNull();

    // StyleId applied
    expect(document.head.querySelector(`style#${styleId}`)).toBeNull();
});

test('Generate JS that applies styles from custom code, with a nonce', async () => {
    const styleId = `style-custom-${Date.now()}`;
    const output = await buildCSSInjectionCode({
        cssToInject: 'body { color: red; }',
        styleId,
        useStrictCSP: true,
        injectCodeFunction: (css, { styleId }) => {
            const $style = document.createElement('style');
            $style.setAttribute('custom-style-strict', '');

            const nonce = document.querySelector<HTMLMetaElement>('meta[property=csp-nonce]')?.content;
            $style.nonce = nonce;

            $style.appendChild(document.createTextNode(css));
            document.head.appendChild($style);
        },
    });

    const $script = document.createElement('script');
    $script.textContent = output?.code || 'throw new Error("UNCAUGHT ERROR")';
    document.head.appendChild($script);

    // Doesn't error
    expect(onerror).not.toBeCalled();

    const elem = document.head.querySelector<HTMLStyleElement>(`style[custom-style-strict]`);

    // Custom attribute added
    expect(elem).not.toBeNull();

    // Did we dynamically set the nonce?
    expect(elem?.nonce).toBe('abc-123');
});

test('Remove link stylesheets', async () => {
    const htmlGenerate = (cssFileName) => `<link rel="stylesheet" href="${cssFileName}">`;
    const cssFileName1 = `foo.css`;
    const cssFileNameDifferent = `bar.css`;

    const tagLinkCssFileName1 = htmlGenerate(cssFileName1);
    const emptyString = removeLinkStyleSheets(tagLinkCssFileName1, cssFileName1);
    expect(emptyString).toEqual('');

    const tagLinkNotChanged = removeLinkStyleSheets(tagLinkCssFileName1, cssFileNameDifferent);
    expect(tagLinkNotChanged).toEqual(tagLinkCssFileName1);
});

test('Generate JS that applies styles', async () => {
    const styleId = `style-${Date.now()}`;
    const output = await buildCSSInjectionCode({
        cssToInject: 'body { color: red; }',
        styleId,
    });

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
