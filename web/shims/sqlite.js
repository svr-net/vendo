'use strict';
// node:sqlite's DatabaseSync API implemented on top of sql.js (SQLite compiled to WebAssembly).
// The Service Worker loads the WASM module first and passes it in with configure().

let SQL = null;
let initialBytes = null;
let dirty = false;

const toParam = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);

class StatementSync {
  constructor(db, sql) { this.db = db; this.sql = sql; }
  exec(mode, params) {
    const st = this.db.raw.prepare(this.sql);
    try {
      st.bind(params.map(toParam));
      if (mode === 'get') return st.step() ? st.getAsObject() : undefined;
      if (mode === 'all') { const rows = []; while (st.step()) rows.push(st.getAsObject()); return rows; }
      st.step();
      dirty = true;
      return { changes: this.db.raw.getRowsModified(), lastInsertRowid: 0 };
    } finally { st.free(); }
  }
  get(...p) { return this.exec('get', p); }
  all(...p) { return this.exec('all', p); }
  run(...p) { return this.exec('run', p); }
}

class DatabaseSync {
  constructor() {
    if (!SQL) throw new Error('SQLite WASM not initialised');
    this.raw = new SQL.Database(initialBytes || undefined);
  }
  exec(sql) { this.raw.exec(sql); dirty = true; }
  prepare(sql) { return new StatementSync(this, sql); }
  close() { this.raw.close(); }
}

let current = null;
module.exports = {
  DatabaseSync: class extends DatabaseSync { constructor(f) { super(f); current = this; } },
  StatementSync,
  // --- hooks for the Service Worker ---
  configure({ SQL: s, bytes }) { SQL = s; initialBytes = bytes || null; },
  takeSnapshot() {
    if (!dirty || !current) return null;
    dirty = false;
    const bytes = current.raw.export();
    current.raw.exec('PRAGMA foreign_keys = ON;'); // export() resets this pragma
    return bytes;
  },
};
