import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      runtime: 'nodejs20.x'
    }),
    serviceWorker: {
      register: true
    },
    alias: {
      $lib: 'src/lib',
      '$lib/*': 'src/lib/*'
    }
  }
};

export default config;
