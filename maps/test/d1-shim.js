// Tiruan tipis API D1 di atas node:sqlite, supaya tes berjalan tanpa Cloudflare.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

class Statement {
  constructor(sqlite, sql, args = []) {
    Object.assign(this, { sqlite, sql, args });
  }

  bind(...args) {
    return new Statement(this.sqlite, this.sql, args);
  }

  async first() {
    return this.sqlite.prepare(this.sql).get(...this.args) ?? null;
  }

  async all() {
    return { results: this.sqlite.prepare(this.sql).all(...this.args) };
  }

  async run() {
    if (/^\s*(SELECT|WITH)\b/i.test(this.sql)) return { results: this.sqlite.prepare(this.sql).all(...this.args), meta: {} };
    const result = this.sqlite.prepare(this.sql).run(...this.args);
    return { meta: { last_row_id: Number(result.lastInsertRowid), changes: Number(result.changes) } };
  }
}

export function createD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return {
    sqlite,
    prepare: (sql) => new Statement(sqlite, sql),
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

export const fileAssets = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    try {
      return new Response(readFileSync(new URL(`../public${pathname}`, import.meta.url)));
    } catch {
      return new Response('', { status: 404 });
    }
  },
};
