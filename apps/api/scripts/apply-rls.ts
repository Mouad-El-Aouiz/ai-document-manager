import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Client } from 'pg';

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
  throw new Error(
    `DATABASE_URL must use user "aidm_app" (got "${parsedApp.username}")`,
  );
}
const appPassword = parsedApp.password;
if (!appPassword) {
  throw new Error('DATABASE_URL must contain a password for aidm_app');
}

async function main(): Promise<void> {
  const client = new Client({ connectionString: migrateUrl });
  await client.connect();

  try {
    // 1. Synchroniser le mot de passe aidm_app depuis .env
    const escapedPassword = appPassword.replace(/'/g, "''");
    await client.query(`ALTER ROLE aidm_app WITH PASSWORD '${escapedPassword}'`);

    // 2. Appliquer tout le fichier rls.sql en une seule fois.
    //    Le driver `pg` gère nativement les multi-commandes et les blocs $$.
    const sql = readFileSync(rlsPath, 'utf-8');
    await client.query(sql);

    console.log('RLS applied successfully and aidm_app password synced from .env');
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});