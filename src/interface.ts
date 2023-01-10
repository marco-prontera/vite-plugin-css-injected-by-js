import { InjectCode, InjectCodeFunction } from './utils';

export interface PluginConfiguration {
    injectCode?: InjectCode;
    injectCodeFunction?: InjectCodeFunction;
    styleId?: string;
    topExecutionPriority?: true;
    useStrictCSP?: boolean;
}

export interface BuildCSSInjectionConfiguration extends PluginConfiguration {
    cssToInject: string;
}
