// Database migration runner
import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';

interface MigrationRecord {
  version: number;
  applied_at: string;
}

/**
 * Get the current schema version from the database
 */
export function getCurrentVersion(db: Database.Database): number {
  try {
    const result = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as MigrationRecord | undefined;
    return result?.version ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Get all available migration files sorted by version
 */
export function getMigrationFiles(): { version: number; path: string }[] {
  const migrationsDir = path.dirname(__filename);
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => {
      const match = f.match(/^(\d+)_/);
      if (!match || !match[1]) return null;
      return {
        version: parseInt(match[1], 10),
        path: path.join(migrationsDir, f),
      };
    })
    .filter((m): m is { version: number; path: string } => m !== null)
    .sort((a, b) => a.version - b.version);

  return files;
}

/**
 * Apply pending migrations to the database
 */
export function applyMigrations(db: Database.Database): { applied: number[]; errors: string[] } {
  const currentVersion = getCurrentVersion(db);
  const migrations = getMigrationFiles();
  const applied: number[] = [];
  const errors: string[] = [];

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue; // Already applied
    }

    try {
      const sql = fs.readFileSync(migration.path, 'utf-8');

      // Split by statements and execute each one
      // This handles ALTER TABLE failures gracefully (e.g., column already exists)
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        try {
          db.exec(statement);
        } catch (err) {
          // Log but continue - some ALTER TABLE statements may fail if column exists
          const errMsg = err instanceof Error ? err.message : String(err);
          if (!errMsg.includes('duplicate column name') &&
              !errMsg.includes('already exists') &&
              !errMsg.includes('UNIQUE constraint failed')) {
            errors.push(`Migration ${migration.version}: ${errMsg}`);
          }
        }
      }

      applied.push(migration.version);
      console.log(`Applied migration ${migration.version}`);
    } catch (err) {
      errors.push(`Failed to apply migration ${migration.version}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { applied, errors };
}

/**
 * Check if a specific table exists
 */
export function tableExists(db: Database.Database, tableName: string): boolean {
  const result = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  return result !== undefined;
}

/**
 * Check if a column exists in a table
 */
export function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  try {
    const result = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return result.some(col => col.name === columnName);
  } catch {
    return false;
  }
}
