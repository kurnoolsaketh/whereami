import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // the spring boot app from stages 1 and 2. proxying keeps the browser on one origin, so
    // there is no cors configuration to keep in step with the backend
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
