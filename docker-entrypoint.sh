#!/bin/sh
set -e

echo "🔄 Esecuzione migrazioni Prisma..."
npx prisma migrate deploy

echo "✅ Migrazioni completate!"
echo "🚀 Avvio server Formit..."

exec node dist/server/api/server.js

