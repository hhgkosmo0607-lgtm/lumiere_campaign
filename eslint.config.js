import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * ESLint 9의 새 설정 형식(flat config)이라 .eslintrc가 아니라 이 파일 하나로 규칙을 정한다.
 * react-hooks 플러그인이 가장 값어치가 높다 — useEffect·useMemo의 의존성 배열을 빠뜨리는
 * 실수(예: 조건이 바뀌었는데 재계산이 안 되는 버그)를 코드 작성 시점에 잡아준다.
 *
 * src(브라우저에서 도는 앱)와 scripts(터미널에서 도는 Node 스크립트)는 쓸 수 있는 전역
 * 값이 다르다(window vs process 등) — 그래서 두 그룹을 나눠서 규칙을 적용한다.
 */
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off', // prop-types 패키지로 이미 별도 검사한다
      'react/react-in-jsx-scope': 'off', // React 18 자동 JSX 변환이라 필요 없다
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/test/**', 'src/**/__tests__/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, File: 'readonly' },
    },
    rules: { 'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }] },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'scripts/native/**', 'preview.html'],
  },
];
