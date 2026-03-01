import type { InjectCode, InjectCodeFunction } from './utils';
import type { OutputAsset, OutputChunk } from 'rollup';
import type { BuildOptions } from 'vite';
import type { ModuleFormat } from 'rollup';

export interface DevOptions {
    enableDev?: boolean;
    removeStyleCode?: (id: string) => string;
    removeStyleCodeFunction?: (id: string) => void;
}

export interface BaseOptions {
    dev?: DevOptions;
    injectCode?: InjectCode;
    injectCodeFunction?: InjectCodeFunction;
    injectionCodeFormat?: ModuleFormat;
    topExecutionPriority?: boolean;
    useStrictCSP?: boolean;
    attributes?: { [key: string]: string | (() => string) } | undefined;
}

export interface PluginConfiguration extends BaseOptions {
    cssAssetsFilterFunction?: (chunk: OutputAsset) => boolean;
    jsAssetsFilterFunction?: (chunk: OutputChunk) => boolean;
    preRenderCSSCode?: (cssCode: string) => string;
    relativeCSSInjection?: boolean;
    suppressUnusedCssWarning?: boolean;
    // This will be removed in 5.0.0 in favor of `attributes` and is only kept for backward compatibility until then.
    styleId?: string | (() => string);
}

export interface CSSInjectionConfiguration extends BaseOptions {
    cssToInject: string;
}

export interface BuildCSSInjectionConfiguration extends CSSInjectionConfiguration {
    buildOptions: BuildOptions;
}
