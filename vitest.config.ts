import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'happy-dom',
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html'],
            skipFull: false,
            branches: 70,
            lines: 70,
            functions: 70,
            statements: 70
        },
    },
});
