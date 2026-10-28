import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const sandboxDomain = process.env.BASE44_SANDBOX_HOST_DOMAIN;
const previewMode = process.env.BASE44_PREVIEW_MODE === '1';

// El proxy del preview llega con Host: 3000-<sandbox id>.<dominio>, que es un
// "hermano" del dominio y no un subdominio suyo: hay que permitir ambas formas.
const allowedHosts =
  previewMode && sandboxDomain ? [`.${sandboxDomain}`, `3000-${sandboxDomain}`] : undefined;

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts,
    proxy: {
      '/api': { target: 'http://api:8000', changeOrigin: true },
      '/uploads': { target: 'http://api:8000', changeOrigin: true },
    },
    watch: { usePolling: true, interval: 300 },
  },
  plugins: [react()],
});
