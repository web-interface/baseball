import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: https://web-interface.github.io/baseball/
// 경기 엔진(../shared/engine)은 web 밖에 있어서 개발 서버가 읽을 수 있게 허용한다
export default defineConfig({ base: '/baseball/', plugins: [react()], server: { fs: { allow: ['..'] } } });
