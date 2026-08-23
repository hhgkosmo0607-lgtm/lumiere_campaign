import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages는 프로젝트 페이지를 https://계정.github.io/저장소이름/ 처럼
  // 하위 경로에 올린다(루트가 아니다). 배포용 빌드(GITHUB_PAGES=true)일 때만 저장소
  // 이름을 base로 넣는다 — 로컬 개발(npm run dev)·미리보기(vite preview)는 그대로 루트로 둔다.
  base: process.env.GITHUB_PAGES ? '/lumiere_campaign/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
