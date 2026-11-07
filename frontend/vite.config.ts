import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // /api/users/1/insights → http://localhost:8000/users/1/insights (the FastAPI backend)
    proxy: { '/api': { target: 'http://localhost:8000', rewrite: (path) => path.replace(/^\/api/, '') } },
  },
})
