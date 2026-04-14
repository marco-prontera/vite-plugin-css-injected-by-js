# vite-plugin-css-injected-by-js 🤯
[![npm version](https://badge.fury.io/js/vite-plugin-css-injected-by-js.svg)](https://www.npmjs.com/package/vite-plugin-css-injected-by-js)

A Vite plugin that bundles your CSS into JavaScript at build time, removing separate CSS files and enabling single-file deployments.

## How does it work

By default, Vite extracts CSS into separate files during the build process. This plugin instead gathers all generated CSS and embeds it directly into the JavaScript bundle, injecting it at runtime. As a result, no standalone CSS file is produced and the corresponding `<link>` tag is removed from the generated HTML. You can also control the timing of the injection, specifying whether the styles should be applied before or after your application code executes.

## Installation

```terminal
npm install vite-plugin-css-injected-by-js --save-dev
```

or

```terminal
yarn add vite-plugin-css-injected-by-js -D
```

or

```terminal
pnpm add vite-plugin-css-injected-by-js -D
```

## Usage

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  plugins: [
    cssInjectedByJsPlugin()
  ]
})
```

By default, the CSS is injected automatically when the JavaScript bundle loads. If you need **explicit control** over when the CSS is injected (e.g. for Web Components, Shadow DOM, or SPAs that need to defer rendering), see the [Virtual Module](#virtual-module-on-demand-injection) section below.

---

## Virtual Module: On-Demand Injection

The plugin exposes an optional virtual module `virtual:css-injected-by-js` that gives you **explicit control** over when and where the bundled CSS is injected into the DOM.

### When to use this

| Use case | Recommended approach |
|---|---|
| Component-level granular lazy-loading | Vite's native `?inline` query |
| **Macro-level** injection control (Library authors, Web Components, SPAs) | **Virtual module** `virtual:css-injected-by-js` |

> **`?inline` vs Virtual Module:** For component-level CSS that you want to control per-file, use Vite's built-in `?inline` query (e.g. `import css from './my.css?inline'`). The virtual module is designed for **macro-level** control over the *entire bundled CSS payload* — deferring injection until your app is ready, or targeting a specific DOM node like a `ShadowRoot`.

### Basic example

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
  plugins: [
    cssInjectedByJsPlugin()
  ]
})
```

```ts
// src/main.ts
import { injectCSS, removeCSS } from 'virtual:css-injected-by-js'

// Your application setup...
const app = createApp()
app.mount('#app')

// Inject all bundled CSS when you're ready
injectCSS()

// If you need to clean the environment you can also remove the CSS
removeCSS()
```

### ⚠️ Advanced Configuration Limitations

When using the `virtual:css-injected-by-js` module, please be aware of the following architectural boundaries:

* **`topExecutionPriority` is ignored:** When using the virtual module, the plugin forces the injection payload to the absolute top of your chunks. This is mathematically required to ensure the CSS Queue is initialized before your application code calls `injectCSS()`.
* **Custom `injectCode` Boundaries:** The `removeCSS()` function uses a synchronous `MutationObserver` on the target element. It will fail to track and remove your styles if your custom code:
  1. Injects into an element other than the configured `target`.
  2. Uses asynchronous logic (`setTimeout`, Promises, `requestAnimationFrame`).
  3. Uses Constructable Stylesheets (`new CSSStyleSheet()`) instead of actual DOM nodes.

### Shadow DOM example

Pass a `target` option to inject the CSS into a `ShadowRoot` instead of `document.head`:

```ts
import { injectCSS } from 'virtual:css-injected-by-js'

class MyWidget extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' })
    shadow.innerHTML = `<div class="widget">Hello</div>`

    // Inject the bundled CSS into this Shadow DOM
    injectCSS({ target: shadow })
  }
}

customElements.define('my-widget', MyWidget)
```

### Server-Side Rendering (SSR) extraction

In SSR environments (like Next.js, Nuxt, or custom Node servers), DOM methods like `document.head.appendChild` are not available. Calling `injectCSS()` will safely do nothing. 
Instead, you can extract the raw CSS string to manually inject it into your server-rendered HTML payload.

```ts
import { getRawCSS } from 'virtual:css-injected-by-js'

export function render() {
  const appHtml = renderToString(MyApp)
  const cssString = getRawCSS()

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>\${cssString}</style>
      </head>
      <body>
        <div id="app">\${appHtml}</div>
      </body>
    </html>
  `
}
```
> **Note:** In Vite Dev Mode (`npm run dev`), `getRawCSS()` will return an empty string because Vite handles CSS natively via HMR. Test your SSR CSS extraction using the production build (`npm run build`).

### TypeScript support

The plugin ships type declarations for the virtual module. Add it to your `tsconfig.json`:

```jsonc
{
  "compilerOptions": {
    "types": ["vite-plugin-css-injected-by-js/dist/esm/declarations/client"]
  }
}
```

The `InjectCSSOptions` interface:

```ts
declare module 'virtual:css-injected-by-js' {
  export interface InjectCSSOptions {
    /**
     * The DOM element where the <style> tag will be injected.
     * @default document.head
     */
    target?: HTMLElement | ShadowRoot;
  }

  export function injectCSS(options?: InjectCSSOptions): void;
  export function removeCSS(): void;
  
  /**
   * Returns the raw extracted CSS string. 
   * Highly useful for Server-Side Rendering (SSR) where DOM injection is impossible.
   */
  export function getRawCSS(): string;
}
```

### How it works under the hood

#### Build mode (Queue & Unlock)

During the build, each chunk's CSS injection code is wrapped in a function and pushed onto a global queue (`globalThis.__VITE_CSS_QUEUE__`). The CSS is **not** injected until you call `injectCSS()`. When called:

1. A global flag (`globalThis.__VITE_CSS_UNLOCKED__`) is set to `true`.
2. The queue is flushed — all pending CSS is injected.
3. Any future lazy-loaded chunks that arrive after the unlock inject their CSS immediately.

This ensures correct behavior with `relativeCSSInjection` and code-split chunks that load asynchronously.

#### Dev mode (Mute & Observe)

In development, Vite handles CSS natively for HMR. The virtual module uses a `MutationObserver` to **mute** all `<style data-vite-dev-id>` tags (by setting `media="not all"`) as soon as they appear. When you call `injectCSS()`:

1. The observer is disconnected.
2. All cached style nodes are unmuted (`media` attribute removed).
3. If a `target` is provided, the style nodes are moved into that target.

#### SSR & Web Worker safety

All DOM operations are guarded by `typeof document !== 'undefined'` checks and `globalThis` is used instead of `window`. The `injectCSS()` call is a safe no-op in SSR or Web Worker contexts.

---

## Source Maps

The plugin correctly preserves source maps when prepending CSS injection code to your chunks. When `build.sourcemap` is enabled and `topExecutionPriority` is `true` (the default), the injected CSS code is flattened into a single line and prepended to the chunk. The source map `mappings` string is shifted by prepending a single `;` character, which moves all original mappings down by exactly one row. This ensures debugger breakpoints remain accurate.

No additional configuration is needed — source maps work automatically with all injection modes (`topExecutionPriority`, `relativeCSSInjection`, and the virtual module).

---

## Configurations

When you add the plugin, you can provide a configuration object. Below you can find all configuration parameters
available.

### cssAssetsFilterFunction (function)

The `cssAssetsFilterFunction` parameter allows you to specify a filter function that will enable you to exclude some
output css assets.

**This option is not applied to `relativeCSSInjection` logic.**

Here is an example of how to use the `cssAssetsFilterFunction`:

```javascript
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({
            cssAssetsFilterFunction: function customCssAssetsFilterFunction(outputAsset) {
                return outputAsset.fileName == 'font.css';
            }
        }),
    ]
})
```

### dev (object)

**EXPERIMENTAL**
Why experimental? Because it uses a non-conventional solution.

Previously, the plugin strictly applied logic solely during the build phase. Now, we have the capability to experiment
with it in the development environment.

To activate the plugin in the development environment as well, you need to configure a dev object and set the `enableDev`
parameter to true.

Here's an example:

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({
            dev: {
                enableDev: true,
                removeStyleCodeFunction: function removeStyleCode(id: string) {
                    // The 'id' corresponds to the value of the 'data-vite-dev-id' attribute found on the style element. This attribute is visible even when the development mode of this plugin is not activated.
                }
            }
        }),
    ]
})
```

This approach should serve its purpose effectively unless you're employing custom injection code to insert styles where
necessary. Since the development environment involves the concept of "updating" styles in the Document Object Model (
DOM), this plugin requires code to remove the injected style from the DOM.

Due to these factors, if you're utilizing custom injection code (via `injectCode` or `injectCodeFunction`), the plugin
cannot automatically discern how to delete the injected style. Therefore, all you need to do is configure
either `removeStyleCode` or `removeStyleCodeFunction` within the `dev` object as demonstrated above.

**NOTE:** The `injectCode` and `injectCodeFunction` parameters now also include the `attributes`, and in `dev` mode,
the `attributes` object encompasses the `data-vite-dev-id` as well. Refer to the `injectCodeFunction` example below for
further details.

### injectCode (function)

You can provide also a function for `injectCode` param to customize the injection code used. The `injectCode` callback
must return a `string` (with valid JS code) and it's called with two arguments:

- cssCode (the `string` that contains all the css code that need to be injected via JavaScript)
- options (an object with `styleId`, `useStrictCSP` and `attributes` the last is an object that represent the attributes
  of the style element that should have)

This is an example:

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({
            injectCode: (cssCode: string, options: InjectCodeOptions) => {
                return `try{if(typeof document != 'undefined'){var elementStyle = document.createElement('style');elementStyle.appendChild(document.createTextNode(${cssCode}));document.head.appendChild(elementStyle);}}catch(e){console.error('vite-plugin-css-injected-by-js', e);}`
            }
        }),
    ]
})
```

### injectCodeFunction (function)

If you prefer to specify the injectCode as a plain function you can use the `injectCodeFunction` param.

The `injectCodeFunction` function is a void function that will be called at runtime application with two arguments:

- cssCode (the `string` that contains all the css code that need to be injected via JavaScript)
- options (an object with `styleId`, `useStrictCSP` and `attributes` the last is an object that represent the attributes
  of the style element that should have)

This is an example:

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({
            injectCodeFunction: function injectCodeCustomRunTimeFunction(cssCode: string, options: InjectCodeOptions) {
                try {
                    if (typeof document != 'undefined') {
                        var elementStyle = document.createElement('style');

                        // SET ALL ATTRIBUTES
                        for (const attribute in options.attributes) {
                            elementStyle.setAttribute(attribute, options.attributes[attribute]);
                        }

                        elementStyle.appendChild(document.createTextNode(${cssCode}));
                        document.head.appendChild(elementStyle);
                    }
                } catch (e) {
                    console.error('vite-plugin-css-injected-by-js', e);
                }
            }
        }),
    ]
})
```

### injectionCodeFormat (ModuleFormat)

You can specify the format of the injection code, by default is `iife`.

### jsAssetsFilterFunction (function)

The `jsAssetsFilterFunction` parameter allows you to specify which JavaScript file(s) the CSS injection code should be
added to. This is useful when using a Vite configuration that exports multiple entry points in the building process. The
function takes in an OutputChunk object and should return true for the file(s) you wish to use as the host of the CSS
injection. If multiple files are specified, the CSS injection code will be added to all files returned as true.

Here is an example of how to use the `jsAssetsFilterFunction`:

```javascript
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({
            jsAssetsFilterFunction: function customJsAssetsfilterFunction(outputChunk) {
                return outputChunk.fileName == 'index.js';
            }
        }),
    ]
})
```

In this example, the CSS injection code will only be added to the `index.js` file. If you wish to add the code to
multiple files, you can specify them in the function:

```javascript
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({
            jsAssetsFilterFunction: function customJsAssetsfilterFunction(outputChunk) {
                return outputChunk.fileName == 'index.js' || outputChunk.fileName == 'subdir/main.js';
            }
        }),
    ]
})
```

This code will add the injection code to both index.js and main.js files.
**Be aware that if you specified multiple files that the CSS can be doubled.**

### preRenderCSSCode (function)

You can use the `preRenderCSSCode` parameter to make specific changes to your CSS before it is printed in the output JS
file. This parameter takes the CSS code extracted from the build process and allows you to return the modified CSS code
to be used within the injection code.

This way, you can customize the CSS code without having to write additional code that runs during the execution of your
application.

This is an example:

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({preRenderCSSCode: (cssCode) => cssCode}), // The return will be used as the CSS that will be injected during execution.
    ]
})
```

### relativeCSSInjection (boolean)

_This feature is based on information provided by Vite. Since we can't control how Vite handles this information this
means that there may be problems that may not be possible to fix them in this plugin._

The default behavior of this plugin takes all the CSS code of your application directly to the entrypoint generated.
The `relativeCSSInjection` if configured to `true` will inject the CSS code of every entrypoint to the relative
importer.

**Set this option to `true` if you are using the multiple entry point option of Rollup.**
**For this feature to work, `build.cssCodeSplit` must be set to `true`**

_Future release can have an advanced behavior where this options will be configured to true automatically by sniffing
user configurations._

If a CSS chunk is generated that's not imported by any JS chunk, a warning will be shown. To disable this warning
set `suppressUnusedCssWarning` to `true`.

### styleId (string | function)

⚠️**The "styleId" option is deprecated and will be removed in 6.0.0, please use the "attributes" option instead with an "id" property.⚠️**

If you provide a `string` for `styleId` param, the code of injection will set the `id` attribute of the `style` element
with the value of the parameter provided. This is an example:

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({styleId: "foo"}),
    ]
})
```

The output injected into the DOM will look like this example:

```html

<head>
    <style id="foo">/* Generated CSS rules */</style>
</head>
```

If you provide a `function` for `styleId` param, it will run that function and return a string. It's especially useful
if you use `relativeCSSInjection` and want unique styleIds for each file.

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({styleId: () => `foo-${Math.random() * 100}`}),
    ]
})
```

```html

<head>
    <style id="foo-1234">/* Generated CSS rules */</style>
    <style id="foo-4321">/* Generated CSS rules */</style>
</head>
```

### attributes (object)

The `attributes` parameter allows you to add custom HTML attributes to the injected `<style>` tag. This is the recommended replacement for the deprecated `styleId` option.
You can pass static strings or functions that return strings.

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({
            attributes: {
                'id': 'my-custom-style-id',
                'data-theme': 'dark',
                'data-timestamp': () => Date.now().toString()
            }
        }),
    ]
})
```

### topExecutionPriority (boolean)

The default behavior adds the injection of CSS before your bundle code. If you provide `topExecutionPriority` equal
to: `false`  the code of injection will be added after the bundle code. This is an example:

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({topExecutionPriority: false}),
    ]
})
```

### useStrictCSP (boolean)

The `useStrictCSP` configuration option adds a nonce to style tags based
on `<meta property="csp-nonce" content={{ nonce }} />`. See the following [link](https://cssinjs.org/csp/?v=v10.9.2) for
more information.

This is an example:

```ts
import { defineConfig } from 'vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'

export default defineConfig({
    plugins: [
        cssInjectedByJsPlugin({useStrictCSP: true}),
    ]
})
```

The tag `<meta property="csp-nonce" content={{ nonce }} />` (nonce should be replaced with the value) must be present in
your html page. The `content` value of that tag will be provided to the `nonce` property of the `style` element that
will be injected by our default injection code.

## Contributing

Want to modify the plugin? Check out our [CONTRIBUTING.md](CONTRIBUTING.md) for a complete guide on how to compile the TypeScript source, run the test suite, and test your changes locally.

## A note for plugin-legacy users

At first the plugin supported generating the CSS injection code also in the legacy files generated by
the [plugin-legacy](https://github.com/vitejs/vite/tree/main/packages/plugin-legacy). Since the plugin-legacy injects
the CSS code for [different reasons](https://github.com/vitejs/vite/issues/2062), this plugin no longer has the
plugin-legacy support code. If the code of the plugin-legacy changes an update to this plugin may occur.
