import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    {
      name: 'static-pages-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0];
          const acceptsHtml = req.headers.accept?.includes('text/html');
          
          if (acceptsHtml) {
            const staticRewrites = [
              '/privacy',
              '/terms',
              '/cookie-policy',
              '/contact',
              '/about',
              '/refund-policy'
            ];
            if (url === '/' || url === '/landing') {
              req.url = '/index.html';
            } else if (url && staticRewrites.includes(url)) {
              req.url = `${url}.html`;
            } else if (url && !url.startsWith('/api') && !url.startsWith('/admin')) {
              req.url = '/app.html';
            }
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        app: path.resolve(__dirname, 'app.html')
      }
    }
  },
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
