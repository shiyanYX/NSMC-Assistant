import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true
  },
  build: {
    rollupOptions: {
      external: ['@tauri-apps/api', '@tauri-apps/api/shell']
    }
  },
  optimizeDeps: {
    exclude: ['@tauri-apps/api', '@tauri-apps/api/shell']
  }
})