declare module 'virtual:css-injected-by-js' {
    export interface InjectCSSOptions {
        /**
         * The target element where the `<style>` tag will be appended.
         * Useful for injecting CSS into a Shadow DOM root.
         *
         * In **Dev mode** this option moves the unmuted `<style>` tags into the
         * specified target after they are revealed.
         *
         * @default document.head
         */
        target?: HTMLElement | ShadowRoot;
    }

    /**
     * Injects the bundled CSS into the DOM.
     *
     * - **Build mode:** Flushes the internal CSS queue and unlocks future
     *   lazy-loaded chunks so they inject immediately upon arrival.
     * - **Dev mode:** Unmutes `<style data-vite-dev-id>` tags that were hidden
     *   by a `MutationObserver` at load time, restoring native Vite HMR.
     *
     * SSR & Web-Worker safe — the call is a no-op when `document` is not
     * available.
     *
     * @param options - Optional injection parameters.
     */
    export function injectCSS(options?: InjectCSSOptions): void;
}
