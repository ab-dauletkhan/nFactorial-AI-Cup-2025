import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // string shorthand: /api -> http://localhost:3001/api
      '/api': {
        target: 'http://localhost:3001', // Your backend server address
        changeOrigin: true,
        // secure: false, // If your backend is not HTTPS
        // rewrite: (path) => path.replace(/^\/api/, '') // Optional: if you don't want /api prefix on backend
      }
    }
  }
})
