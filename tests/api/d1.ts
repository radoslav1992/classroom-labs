// A small D1Database stand-in over Node's built-in SQLite, with the real migrations applied.
// It covers what src/api uses: prepare().bind().first()/all()/run(), batch() and exec().
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

class Statement {
  constructor(
    private readonly db: DatabaseSync,
    readonly sql: string,
    private readonly params: SQLInputValue[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new Statement(this.db, this.sql, params.map(value => (value === undefined ? null : (value as SQLInputValue))));
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : { ...row }) as T;
  }

  async all<T>() {
    const rows = this.db.prepare(this.sql).all(...this.params).map(row => ({ ...row }));
    return { success: true, results: rows as T[], meta: {} };
  }

  async run() {
    return this.runSync();
  }

  runSync() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}

export class FakeD1 {
  readonly sqlite = new DatabaseSync(':memory:');

  constructor() {
    const dir = path.resolve(import.meta.dirname, '../../migrations');
    for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.sql')).sort()) {
      this.sqlite.exec(fs.readFileSync(path.join(dir, file), 'utf8'));
    }
  }

  prepare(sql: string) {
    return new Statement(this.sqlite, sql);
  }

  async batch(statements: Statement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = statements.map(statement => statement.runSync());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  async exec(sql: string) {
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  rows(sql = 'SELECT * FROM signups ORDER BY id') {
    return this.sqlite.prepare(sql).all().map(row => ({ ...row }));
  }

  asD1() {
    return this as unknown as D1Database;
  }
}
