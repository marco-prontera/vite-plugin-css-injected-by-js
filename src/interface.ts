import type { InjectCode, InjectCodeFunction } from './utils';
import type { OutputChunk } from 'rollup';
import type { ChunkMetadata } from 'vite';

// Allow us to be aware of the vite metadata on a rendered chunk
// This can be removed if the peer vite version is bumped to >4.1
declare module 'rollup' {
    interface RenderedChunk {
        viteMetadata: ChunkMetadata;
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
    jsAssetsFilterFunction?: (chunk: OutputChunk) => boolean;
    preRenderCSSCode?: (cssCode: string) => string;
    relativeCSSInjection?: boolean;
}

export interface BuildCSSInjectionConfiguration extends BaseOptions {
    cssToInject: string;
}
