import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const buildId = Date.now().toString()

function versionJsonPlugin(): Plugin {
  return {
    name: 'version-json-plugin',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(
          {
            version: buildId,
            builtAt: new Date().toISOString(),
          },
          null,
          2
        ),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), versionJsonPlugin()],
  base: './',
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
})
