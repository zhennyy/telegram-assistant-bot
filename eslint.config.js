// Правила кода: рекомендованный набор ESLint + запрет коротких непонятных имён.
// Весь проект — ES-модули для Node ("type": "module", top-level await).
import js from '@eslint/js';
import globals from 'globals';

const sharedRules = {
  'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }],
  'id-length': ['error', { min: 2, exceptions: ['_'], properties: 'never' }],
  eqeqeq: ['error', 'smart'],
  'prefer-const': 'error',
  'no-var': 'error',
};

export default [
  { ignores: ['node_modules/', 'src/database/generated/', 'data/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: sharedRules,
  },
];
