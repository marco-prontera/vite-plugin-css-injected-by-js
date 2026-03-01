declare module 'virtual:css-injected-by-js' {
  export interface InjectCSSOptions {
    /**
     * The DOM element where the <style> tag will be injected.
     * @default document.head
     */
    target?: HTMLElement | ShadowRoot;
  }

  /**
   * Injects the bundled CSS into the DOM.
   * In Vite Dev Mode, this un-mutes Vite's native CSS.
   */
  export function injectCSS(options?: InjectCSSOptions): void;

  /**
   * Removes or mutes the injected CSS from the DOM.
   */
  export function removeCSS(): void;
}