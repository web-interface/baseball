import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages: https://web-interface.github.io/baseball/
export default defineConfig({ base: '/baseball/', plugins: [react()] });
