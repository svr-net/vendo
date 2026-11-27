'use strict';
const http = require('node:http');
const path = require('node:path');
const config = require('./config');
const db = require('./lib/db');
const { Router, createHandler } = require('./lib/http');
const api = require('./routes/api');
const oauth = require('./routes/oauth');
const { adapters } = require('./platforms');

function createServer() {
  db.open();
  const router = new Router();
  router.get('/healthz', (req, res) => res.json({ ok: true }));
  api.register(router);
  oauth.register(router);

  const handler = createHandler({
    router,
    staticDirs: [['/uploads/', config.uploadsDir], ['/', path.join(__dirname, '..', 'public')]],
    pageAliases: require('./pages'),
  });
  return http.createServer(handler);
}

if (require.main === module) {
  const server = createServer();
  server.listen(config.port, () => {
    const live = Object.values(adapters).filter((a) => a.isConfigured()).map((a) => a.name);
    console.log(`Vendo running at ${config.publicBaseUrl} (port ${config.port})`);
    console.log(live.length ? `Live platform APIs configured: ${live.join(', ')}` : 'No platform API credentials configured: everything runs in sandbox mode. See docs/PLATFORM_SETUP.md');
  });
}

module.exports = { createServer };
