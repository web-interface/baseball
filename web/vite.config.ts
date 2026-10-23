import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: https://web-interface.github.io/baseball/
// 경기 엔진(../shared/engine)은 web 밖에 있어서 개발 서버가 읽을 수 있게 허용한다
// 실제 선수 카탈로그(game/data/kbo/core.json)는 첫 묶음(index)에 넣지 않고 따로 'kbo-core' 파일로 — 연도별 상세 기록(rec-*.json)은 선수 정보를 열 때만 불러온다
export default defineConfig({
  base: '/baseball/',
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.replace(/\\/g, '/').endsWith('/game/data/kbo/core.json')) return 'kbo-core';
          return undefined;
        },
      },
    },
  },
});
