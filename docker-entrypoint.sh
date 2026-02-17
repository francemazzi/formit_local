#!/bin/sh
set -e

echo "🔄 Esecuzione migrazioni Prisma..."
npx prisma migrate deploy

echo "🌱 Esecuzione seed database..."
node dist/server/seed.js || echo "Seed gia applicato o skippato."

echo "✅ Migrazioni e seed completati!"
echo "🚀 Avvio server Formit..."

exec node dist/server/api/server.js

