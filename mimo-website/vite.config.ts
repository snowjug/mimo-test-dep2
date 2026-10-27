import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

import fs from 'fs'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
    {
      name: 'static-pages-rewrite',
      configureServer(server) {
        const adminDistPath = path.resolve(__dirname, 'mimo-admin-dashboard/dist');

        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0];

          // Serve /admin/assets/* from mimo-admin-dashboard/dist/assets
          if (url?.startsWith('/admin/assets/')) {
            const relPath = url.replace('/admin/assets/', '');
            const filePath = path.join(adminDistPath, 'assets', relPath);
            if (fs.existsSync(filePath)) {
              const mimeTypes: Record<string, string> = {
                '.js': 'application/javascript',
                '.css': 'text/css',
                '.svg': 'image/svg+xml',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.json': 'application/json',
              };
              const ext = path.extname(filePath);
              res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
              return fs.createReadStream(filePath).pipe(res);
            }
          }

          const isFile = Boolean(url && (path.extname(url) || url.startsWith('/@') || url.startsWith('/src') || url.startsWith('/node_modules')));
          const acceptsHtml = !isFile && (!req.headers.accept || req.headers.accept.includes('text/html') || req.headers['sec-fetch-dest'] === 'document' || req.headers.accept.includes('*/*'));
          
          if (acceptsHtml) {
            // Check for admin & finance routes (mimics vercel.json rewrite to /admin/index.html)
            const adminRoutes = ['/admin', '/finance', '/technical', '/hr', '/marketing'];
            const isAdminRoute = url && adminRoutes.some((route) => url === route || url.startsWith(`${route}/`));
            
            if (isAdminRoute) {
              const adminHtmlPath = path.join(adminDistPath, 'index.html');
              if (fs.existsSync(adminHtmlPath)) {
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                return fs.createReadStream(adminHtmlPath).pipe(res);
              }
            }

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
            } else if (url === '/blog') {
              req.url = '/blog.html';
            } else if (url && url.startsWith('/blog/')) {
              req.url = `${url}.html`;
            } else if (url && staticRewrites.includes(url)) {
              req.url = `${url}.html`;
            } else if (url && !url.startsWith('/api')) {
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
