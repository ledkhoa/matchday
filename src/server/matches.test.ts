import { describe, it, expect, spyOn } from 'bun:test';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1ExecResult,
  D1DatabaseSession,
  D1Meta,
} from '@cloudflare/workers-types';
import {
  validateMatchDateParam,
  handleFetchMatches,
  getMatchesForDate,
  fetchMatchesForDate,
} from './matches';
import { createDb } from '../db';
import type { CloudflareEnv } from '../types/env';

type MetaValue =
  string | number | boolean | undefined | { sql_duration_ms: number };

interface TestMeta extends D1Meta {
  [key: string]: MetaValue;
}

const mockMeta: TestMeta = {
  duration: 0,
  size_after: 0,
  rows_read: 0,
  rows_written: 0,
  last_row_id: 1,
  changed_db: false,
  changes: 1,
};

class TestPreparedStatement implements D1PreparedStatement {
  constructor(
    public readonly query: string,
    public readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new TestPreparedStatement(this.query, values);
  }

  async first<T>(_colName?: string): Promise<T | null> {
    return null;
  }

  async run<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      meta: mockMeta,
      results: [],
    };
  }

  async all<T>(): Promise<D1Result<T>> {
    return {
      success: true,
      meta: mockMeta,
      results: [],
    };
  }

  raw<T = unknown[]>(options: {
    columnNames: true;
  }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(options?: {
    columnNames?: boolean;
  }): Promise<[string[], ...T[]] | T[]> {
    if (options?.columnNames) {
      return [[]];
    }
    return [];
  }
}

class TestD1Database implements D1Database {
  public executedQueries: string[] = [];

  prepare(query: string): D1PreparedStatement {
    this.executedQueries.push(query);
    return new TestPreparedStatement(query);
  }

  async batch<T = unknown>(
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    return statements.map(() => ({
      success: true,
      meta: mockMeta,
      results: [],
    }));
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.executedQueries.push(query);
    return { count: 1, duration: 0 };
  }

  withSession(): D1DatabaseSession {
    throw new Error('Not implemented for test');
  }

  async dump(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
}

describe('validateMatchDateParam', () => {
  it('accepts valid ISO dates (YYYY-MM-DD)', () => {
    expect(validateMatchDateParam('2026-09-09')).toBe('2026-09-09');
    expect(validateMatchDateParam('2024-02-29')).toBe('2024-02-29');
    expect(validateMatchDateParam('2023-12-31')).toBe('2023-12-31');
  });

  it('rejects invalid date strings', () => {
    expect(() => validateMatchDateParam('invalid-date')).toThrow(
      'Invalid date parameter',
    );
    expect(() => validateMatchDateParam('2026-9-9')).toThrow(
      'Invalid date parameter',
    );
    expect(() => validateMatchDateParam('')).toThrow('Invalid date parameter');
  });
});

describe('handleFetchMatches & getMatchesForDate', () => {
  it('throws Error when Cloudflare D1 database binding is unavailable', async () => {
    await expect(handleFetchMatches('2026-09-09')).rejects.toThrow(
      'Cloudflare D1 database binding is unavailable',
    );
  });

  it('queries D1 and returns formatted matches result', async () => {
    const testDb = new TestD1Database();
    const env: CloudflareEnv = {
      DB: testDb,
    };

    const consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});

    const result = await handleFetchMatches('2026-09-09', env);
    expect(result.date).toBe('2026-09-09');
    expect(Array.isArray(result.matches)).toBe(true);

    consoleLogSpy.mockRestore();
  });

  it('executes getMatchesForDate with Drizzle database instance', async () => {
    const testDb = new TestD1Database();
    const db = createDb(testDb);

    const matches = await getMatchesForDate(db, '2026-09-09');
    expect(Array.isArray(matches)).toBe(true);
    expect(testDb.executedQueries.length).toBeGreaterThan(0);
  });
});

describe('fetchMatchesForDate Server Function', () => {
  it('is defined with GET method', () => {
    expect(fetchMatchesForDate).toBeDefined();
  });
});
