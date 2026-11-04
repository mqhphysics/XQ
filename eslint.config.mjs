import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dist-weapp/**',
      '**/node_modules/**',
      '**/.worktrees/**',
      '**/.taro/**',
      '**/.swc/**',
      '**/coverage/**',
      '**/*.tsbuildinfo',
      'private-data/**',
      'tools/wechat-devtools/official-*.js',
      'packages/api-client/src/generated/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/weapp/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.cjs', '**/*.mjs', '**/config/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
)
