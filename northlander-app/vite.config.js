import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    strictPort: false,
    /* Local-dev mirror of the production /stop-images/* Vercel
       rewrite (see vercel.json). Lets the share-poster canvas load
       hero photos from a same-origin path while developing locally. */
    proxy: {
      '/stop-images': {
        target: 'https://www.northlanderguide.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/stop-images/, '/images')
      }
    }
  }
});
