import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        environmentOptions: {
            happyDOM: {
                settings: {
                    enableJavaScriptEvaluation: true,
                },
            },
        },
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html'],
            skipFull: false,
        },
    },
});
