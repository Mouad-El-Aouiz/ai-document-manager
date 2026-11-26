#!/bin/sh
set -e

cd /app

PRISMA="/app/node_modules/.bin/prisma"
TSX="/app/node_modules/.bin/tsx"

echo "▶ Applying migrations..."
"$PRISMA" migrate deploy --schema apps/api/prisma/schema.prisma

echo "▶ Applying RLS..."
"$TSX" apps/api/scripts/apply-rls.ts

echo "▶ Seeding..."
"$TSX" apps/api/prisma/seed.ts

echo "✅ Migrations + RLS + seed done."