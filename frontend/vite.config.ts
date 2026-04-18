import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // NOTE: GitHub Pages 部署在子路径 /KunLun/ 下，通过环境变量控制
  // 本地开发默认 '/'，GitHub Actions 构建时注入 '/KunLun/'
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // NOTE: 固定端口 5174，避免 5173 被残留进程占用时 Vite 自动切换导致混淆
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // NOTE: 视频上传文件较大（可达 100MB+），代理超时需足够长
        timeout: 300000,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // 移除默认的超时限制，允许大文件上传
            proxyReq.setTimeout(300000);
          });
        },
      },
    },
  },
})
