import { InjectCode, InjectCodeFunction } from './utils';
import { OutputChunk } from 'rollup';

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
