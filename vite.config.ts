import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base 用相对路径：部署在 GitHub Pages 的子路径（/<仓库名>/）或任何静态服务器上都能直接打开。
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
});
