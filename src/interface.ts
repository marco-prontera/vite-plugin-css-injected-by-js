import type { ChunkMetadata } from 'vite';
import type { InjectCode, InjectCodeFunction } from './utils';
import type { OutputAsset, OutputChunk } from 'rollup';
import type { BuildOptions } from 'vite';

// Allow us to be aware of the vite metadata on a rendered chunk
// This can be removed if the peer vite version is bumped to >4.1
declare module 'rollup' {
    interface RenderedChunk {
        viteMetadata?: ChunkMetadata;
    }
}

export interface BaseOptions {
    injectCode?: InjectCode;
    injectCodeFunction?: InjectCodeFunction;
    styleId?: string;
    topExecutionPriority?: boolean;
    useStrictCSP?: boolean;
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
