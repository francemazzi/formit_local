# Formit Local

## Requisiti

- Node.js 20+
- SQLite (incluso nel runtime, non serve un server esterno)

## Configurazione

1. Copiare il file `.env` di esempio e verificare il valore di `DATABASE_URL` (default `file:./dev.db`).
2. Installare le dipendenze: `npm install`.
3. Generare il client Prisma (obbligatorio dopo ogni modifica allo schema): `npm run prisma:generate`.

## Migrazioni e database

- Creare o aggiornare il database locale: `npm run prisma:migrate`.
- Aprire Prisma Studio per ispezionare i dati: `npm run prisma:studio`.

## Esecuzione

- Ambiente di sviluppo TypeScript: `npm run dev`.
- Build di produzione: `npm run build` seguito da `npm run start`.

## Percorsi chiave

- `prisma/schema.prisma`: definizione del modello dati e del datasource SQLite.
- `prisma.config.ts`: configurazione Prisma con caricamento variabili d'ambiente via `dotenv`.
- `src/index.ts`: bootstrap OOP che inizializza `PrismaClient` e testa la connessione SQLite.
