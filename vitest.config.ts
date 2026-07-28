import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/domain/**', 'src/application/**', 'src/presentation/store/**'],
      exclude: [
        'node_modules/',
        'tests/',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/domain/ports/',
        'src/domain/factories/',
        'src/application/dto/',
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 60,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@domain': path.resolve(__dirname, './src/domain'),
      '@application': path.resolve(__dirname, './src/application'),
      '@infrastructure': path.resolve(__dirname, './src/infrastructure'),
      '@presentation': path.resolve(__dirname, './src/presentation'),
      'bun:test': path.resolve(__dirname, './tests/bun-test-shim.ts'),
    },
  },
});
