import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  // Production is served under /admin/ (mimo-website's build copies this dist into dist/admin), so the
  // built assets must load from /admin/assets/. The dev server keeps running at the root.
  base: command === 'build' ? '/admin/' : '/',
  build: {
    outDir: 'dist',
  },
}))
