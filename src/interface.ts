import type { InjectCode, InjectCodeFunction } from './utils';
import type { OutputAsset, OutputChunk } from 'rollup';
import type { BuildOptions } from 'vite';

export interface DevOptions {
    enableDev?: boolean;
    removeStyleCode?: (id: string) => string;
    removeStyleCodeFunction?: (id: string) => void;
}

export interface BaseOptions {
    injectCode?: InjectCode;
    injectCodeFunction?: InjectCodeFunction;
    styleId?: string | (() => string);
    topExecutionPriority?: boolean;
    useStrictCSP?: boolean;
    dev?: DevOptions;
}

export interface PluginConfiguration extends BaseOptions {
    cssAssetsFilterFunction?: (chunk: OutputAsset) => boolean;
    jsAssetsFilterFunction?: (chunk: OutputChunk) => boolean;
    preRenderCSSCode?: (cssCode: string) => string;
    relativeCSSInjection?: boolean;
    suppressUnusedCssWarning?: boolean;
}

export interface CSSInjectionConfiguration extends BaseOptions {
    cssToInject: string;
}

export interface BuildCSSInjectionConfiguration extends CSSInjectionConfiguration {
    buildOptions: BuildOptions;
}
