import { IndexHtmlTransformContext, IndexHtmlTransformResult, Plugin } from 'vite';

/**
 * Inject the CSS compiled with JS.
 *
 * @return {Plugin}
 */
export default function cssInjectedByJsPlugin(): Plugin {

    return {
        apply: 'build',
        enforce: 'post',
        name: 'css-in-js-plugin',
        generateBundle(opts, bundle) {

            let styleCode = '';

            for (const key in bundle) {

                if (bundle[key]) {

                    const chunk = bundle[key];

                    if (chunk.type === 'asset' && chunk.fileName.includes('.css')) {

                        styleCode += chunk.source;
                        delete bundle[key];

                    }

                }

            }

            for (const key in bundle) {

                if (bundle[key]) {

                    const chunk = bundle[key];

                    if (chunk.type === 'chunk' && chunk.fileName.includes('.js')) {

                        chunk.code += `try {var bundleStyle = document.createElement('style');bundleStyle.innerText = \`${styleCode}\`;document.head.appendChild(bundleStyle);} catch (e) {console.log(e, "CSSInjectedByJS: Can't add dynamic style to page.");}`;

                    }

                }

            }

        },
        transformIndexHtml: {
            enforce: "post",
            transform(html: string, ctx?: IndexHtmlTransformContext): IndexHtmlTransformResult {

                if (!ctx || !ctx.bundle) return html;

                for (const [, value] of Object.entries(ctx.bundle)) {

                    if (value.fileName.endsWith('.css')) {

                        // Remove CSS link from HTML generated.
                        const reCSS = new RegExp(`<link rel="stylesheet"[^>]*?href="/${value.fileName}"[^>]*?>`);
                        html = html.replace(reCSS, '');

                    }

                }

                return html;

            },
        },
    };

}
