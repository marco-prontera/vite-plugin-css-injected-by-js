declare module 'virtual:css-injected-by-js' {
  export interface InjectCSSOptions {
    /**
     * The DOM element where the <style> tag will be injected.
     * @default document.head
     */
    target?: HTMLElement | ShadowRoot;
  }

  export function injectCSS(options?: InjectCSSOptions): void;
  export function removeCSS(options?: InjectCSSOptions): void;
  
  /**
   * Returns the raw extracted CSS string. 
   * Highly useful for Server-Side Rendering (SSR) where DOM injection is impossible.
   */
  export function getRawCSS(): string;
}