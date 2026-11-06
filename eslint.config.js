import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'packs', 'workspace', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    files: ['src/server/**/*.ts', 'scripts/**/*.{ts,mjs}', 'tests/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.node },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Architecture guardrail: web must never import server code, shared must stay pure.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@server/*', '**/server/**'],
              message: 'web/shared must not import server code. Go through the HTTP API.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/server/**/*.ts', 'tests/**/*.{ts,tsx}', 'scripts/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
