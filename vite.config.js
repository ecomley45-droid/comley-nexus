import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    // Listen on the LAN, not just localhost, so a phone or tablet on the same
    // Wi-Fi can open the dev console at http://<your-mac-ip>:5173. Dev only --
    // `vite build` output is unaffected. The /api and /media proxies below
    // still run on this machine, so the Express server stays on localhost.
    host: true,
    proxy: {
      '/api': 'http://localhost:5050',
      '/media': 'http://localhost:5050',
    },
  },
})
