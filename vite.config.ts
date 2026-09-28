import { defineConfig } from 'vite'
import type { UserConfig } from 'vite';
import react from '@vitejs/plugin-react'
import packageJson from './package.json';
import fs from 'fs'

// https://vite.dev/config/

export default defineConfig(({ command }) => {
  const config: UserConfig = {
    plugins: [react()],
    // Relative asset paths so the build works from any sub-path (GitHub Pages, a file share...).
    base: './',
    resolve: {
      // O: is a mapped network drive whose real path (Y:) Node cannot always open; keep the
      // path as given instead of resolving it.
      preserveSymlinks: true,
    },
    define: {
      'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
    },
  };

  if (command === 'serve') {
    // Apply HTTPS configuration only during development (serve command).
    // ftrack only embeds https widgets, so the dev server needs the mkcert pair in .cert/.
    config.server = {
      port: 3032,
      https: {
        key: fs.readFileSync('./.cert/localhost-key.pem'),
        cert: fs.readFileSync('./.cert/localhost.pem'),
      },
    };
  }

  return config;
});
