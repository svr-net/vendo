'use strict';
/**
 * Builds the static GitHub Pages version of Vendo into dist-pages/.
 *   PAGES_BASE=/vendo/ npm run build:pages
 * The server code is bundled for the browser (Node built-ins replaced by shims in web/shims,
 * node:sqlite replaced by SQLite compiled to WebAssembly) and runs in a Service Worker.
 */
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const out = path.join(root, 'dist-pages');
let base = process.env.PAGES_BASE || '/vendo/';
if (!base.startsWith('/')) base = `/${base}`;
if (!base.endsWith('/')) base += '/';

const SHIMS = { fs: 'fs.js', path: 'path.js', crypto: 'crypto.js', sqlite: 'sqlite.js' };
const nodeShims = {
  name: 'node-shims',
  setup(build) {
    build.onResolve({ filter: /^(node:)?(fs|path|crypto|sqlite|http)$/ }, (args) => {
      const name = args.path.replace(/^node:/, '');
      if (!SHIMS[name]) return { errors: [{ text: `node:${name} is not available in the browser build (imported by ${args.importer})` }] };
      return { path: path.join(__dirname, 'shims', SHIMS[name]) };
    });
  },
};

async function main() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(path.join(root, 'public'), out, { recursive: true });

  const head = (extra = '') => `<base href="${base}">\n  <script src="boot.js"></script>${extra}`;
  for (const f of fs.readdirSync(out).filter((x) => x.endsWith('.html'))) {
    const file = path.join(out, f);
    const html = fs.readFileSync(file, 'utf8');
    if (!html.includes('<base href="/">')) throw new Error(`${f} is missing <base href="/">`);
    fs.writeFileSync(file, html.replace('<base href="/">', head()));
  }
  // GitHub Pages serves 404.html for unknown paths (deep links such as /vendo/campaigns/new on a
  // first visit). Install the worker, then reload so it can route the URL to the right page.
  fs.writeFileSync(path.join(out, '404.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
  ${head()}
  <meta name="viewport" content="width=device-width, initial-scale=1"><title>Vendo</title>
  <link rel="stylesheet" href="css/app.css">
</head><body><main class="container narrow"><p><span class="spinner"></span> Starting Vendo…</p></main>
<script>window.__vendoReady.then(function () { location.reload(); }, function () {
  document.querySelector('main').innerHTML = '<h1>Page not found</h1><p><a href="./">Go to Vendo</a></p>';
});</script></body></html>
`);
  fs.copyFileSync(path.join(__dirname, 'boot.js'), path.join(out, 'boot.js'));
  fs.copyFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'), path.join(out, 'sql-wasm.wasm'));
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  await esbuild.build({
    entryPoints: [path.join(__dirname, 'sw.js')],
    outfile: path.join(out, 'sw.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    plugins: [nodeShims],
    inject: [path.join(__dirname, 'shims', 'globals.js')],
    define: { __dirname: '"/app/src"' },
    logLevel: 'warning',
  });
  const kb = (f) => `${Math.round(fs.statSync(path.join(out, f)).size / 1024)} KB`;
  console.log(`Built ${path.relative(root, out)}/ for base ${base}: sw.js ${kb('sw.js')}, sql-wasm.wasm ${kb('sql-wasm.wasm')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
