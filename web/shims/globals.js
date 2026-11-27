// Injected by esbuild wherever server code uses the Node globals `Buffer` / `process`.
import { Buffer } from 'buffer';

// The `buffer` package lacks Node's 'base64url' encoding, which Vendo uses for ids and tokens.
const toString = Buffer.prototype.toString;
Buffer.prototype.toString = function (enc, ...rest) {
  if (enc === 'base64url') return toString.call(this, 'base64', ...rest).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return toString.call(this, enc, ...rest);
};
const from = Buffer.from;
Buffer.from = function (value, enc, ...rest) {
  if (typeof value === 'string' && enc === 'base64url') return from.call(Buffer, value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return from.call(Buffer, value, enc, ...rest);
};

export { Buffer };

export const process = {
  env: {
    // Sandbox-only demo: no real platform tokens are ever stored, so a fixed secret is fine.
    APP_SECRET: 'vendo-browser-demo',
    DATABASE_PATH: '/data/vendo.db',
    PUBLIC_BASE_URL: (self.registration ? self.registration.scope : self.location.origin + '/').replace(/\/$/, ''),
  },
  cwd: () => '/',
  platform: 'browser',
  versions: {},
};
