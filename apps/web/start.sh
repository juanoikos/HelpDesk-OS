#!/bin/sh
set -e

echo "▶ Aplicando migraciones de base de datos..."
npx prisma migrate deploy --schema=../../packages/db/prisma/schema.prisma

echo "▶ Iniciando HelpDesk OS..."
node .next/standalone/apps/web/server.js
