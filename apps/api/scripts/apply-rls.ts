import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rlsPath = join(__dirname, '..', 'prisma', 'rls.sql');

const migrateUrl = process.env.DATABASE_URL_MIGRATE;
const appUrl = process.env.DATABASE_URL;

if (!migrateUrl) {
  throw new Error('DATABASE_URL_MIGRATE is required');
}
if (!appUrl) {
  throw new Error('DATABASE_URL is required');
}

const parsedApp = new URL(appUrl);
if (parsedApp.username !== 'aidm_app') {
  throw new Error(`DATABASE_URL must use user "aidm_app" (got "${parsedApp.username}")`);
}
const appPassword = parsedApp.password;
if (!appPassword) {
  throw new Error('DATABASE_URL must contain a password for aidm_app');
}

const prisma = new PrismaClient({ datasourceUrl: migrateUrl });

/**
 * Split a SQL file into individual statements.
 * Handles line comments (--), block comments, and single-quoted strings.
 * Adequate for the RLS file which has no dollar-quoted blocks or procedures.
 */
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i] ?? '';
    const next = sql[i + 1] ?? '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (!inSingleQuote && ch === '-' && next === '-') {
      current += ch + next;
      i++;
      inLineComment = true;
      continue;
    }
    if (!inSingleQuote && ch === '/' && next === '*') {
      current += ch + next;
      i++;
      inBlockComment = true;
      continue;
    }
    if (ch === "'") {
      inSingleQuote = !inSingleQuote;
    }
    if (ch === ';' && !inSingleQuote) {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }
    current += ch;
  }

  const trailing = current.trim();
  if (trailing.length > 0) {
    statements.push(trailing);
  }

  return statements;
}

async function main() {
  // 1. Sync aidm_app password from .env (single source of truth)
  const escapedPassword = appPassword.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`ALTER ROLE aidm_app WITH PASSWORD '${escapedPassword}'`);

  // 2. Apply RLS policies
  const sql = readFileSync(rlsPath, 'utf-8');
  const statements = splitSqlStatements(sql);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log(
    `RLS applied: ${String(statements.length)} statement(s), aidm_app password synced from .env`,
  );
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
