# Formit - Client React

**Formit** è un'applicazione web per l'analisi automatica di documenti di analisi microbiologiche. Il sistema utilizza l'intelligenza artificiale per estrarre dati dai PDF e verificare la conformità rispetto a limiti normativi CEIRSA, standard per bevande o criteri personalizzati.

## 🚀 Avvio Rapido

### Prerequisiti

- **Node.js 20+**
- **npm** o **yarn**
- **Server backend** in esecuzione (vedi [README principale](../README.md))

### Installazione

```bash
# Installa le dipendenze
npm install
```

### Avvio in Sviluppo

Il client React si avvia su **porta 5173** e si connette automaticamente al server backend sulla porta 3007.

```bash
# Avvia il client in modalità sviluppo
npm run dev
```

L'applicazione sarà disponibile su: **http://localhost:5173**

> **Nota**: Assicurati che il server backend sia in esecuzione. Avvialo con `npm run api:dev` dalla root del progetto.

### Build per Produzione

```bash
# Compila il progetto
npm run build

# Anteprima della build
npm run preview
```

## 📖 Come Funziona

### Architettura

- **Frontend**: React 19 + TypeScript + Vite
- **Backend API**: Fastify (porta 3007)
- **Database**: SQLite (Prisma ORM)
- **AI**: LangChain per estrazione e analisi documenti

### Flusso di Analisi

1. **Caricamento PDF**: L'utente carica uno o più documenti PDF (max 10 file, 50MB ciascuno)
2. **Estrazione AI**: Il sistema estrae automaticamente:
   - **Matrice**: Tipo di alimento/prodotto (es. "Gelato", "Bevanda", "Carne")
   - **Categoria**: Classificazione CEIRSA o personalizzata
   - **Analisi**: Parametri microbiologici con risultati, unità di misura e metodi
3. **Verifica Conformità**: Confronto automatico con limiti normativi
4. **Risultati**: Visualizzazione con indicazione di conformità per ogni parametro

## 🔬 Esecuzione Analisi

### Verifica PDF Standard

1. Accedi alla pagina **"📄 Verifica PDF"**
2. Trascina o seleziona i file PDF da analizzare
3. Attendi l'elaborazione (il sistema mostra lo stato di avanzamento)
4. Visualizza i risultati con:
   - ✅ **Conforme** (soddisfacente o accettabile)
   - ❌ **Non conforme** (insoddisfacente)
   - 📊 Dettagli per ogni parametro analizzato

### Verifiche Custom

1. Accedi alla pagina **"⚗️ Verifiche Custom"**
2. Crea una nuova categoria o modifica una esistente
3. Definisci i parametri con i relativi limiti
4. Usa la categoria per verificare PDF specifici

### Estrazioni Salvate

- Visualizza tutte le analisi precedentemente eseguite
- Accedi ai dettagli completi di ogni estrazione
- Rianalizza documenti già processati

## ⚙️ Parametri per i Checks

Il sistema utilizza diversi tipi di verifiche a seconda della categoria del documento:

### 1. Check CEIRSA (Alimenti)

**Parametri utilizzati:**
- **Categoria CEIRSA**: Identificata automaticamente dalla matrice
- **Parametro normativo**: Nome del parametro secondo database CEIRSA
- **Limiti normativi**: 
  - **Soddisfacente**: Valore limite superiore (es. `< 10² UFC/g`)
  - **Accettabile**: Range intermedio (es. `10² ≤ x < 10³ UFC/g`)
  - **Insoddisfacente**: Valore limite inferiore (es. `≥ 10³ UFC/g`)
- **Metodo di analisi**: Metodo normativo di riferimento
- **Criterio microbiologico**: Descrizione del criterio applicabile

**Logica di valutazione:**
- Se risultato è nella fascia **soddisfacente** → `isCheck: true`
- Se risultato è nella fascia **accettabile** → `isCheck: true` (conforme ma in attenzione)
- Se risultato è nella fascia **insoddisfacente** → `isCheck: false`

### 2. Check Bevande

**Parametri utilizzati:**
- **Categoria**: "beverage" (identificata automaticamente)
- **Limiti specifici**: Standard normativi per bevande
- **Parametri analizzati**: Microbiologia specifica per bevande

### 3. Check Custom (Personalizzati)

**Parametri configurabili per categoria:**

- **Nome categoria**: Identificativo della categoria personalizzata
- **Tipo campione**: Tipo di campione (es. "food", "beverage", "environmental")
- **Descrizione**: Descrizione della categoria

**Parametri per ogni check:**

- **Nome parametro**: Nome del parametro da verificare
- **Metodo di analisi normativo**: Metodo di riferimento
- **Limiti personalizzati**:
  - `satisfactoryValue`: Limite per fascia soddisfacente (es. `< 100 UFC/g`)
  - `acceptableValue`: Limite per fascia accettabile (es. `100 ≤ x < 1000 UFC/g`)
  - `unsatisfactoryValue`: Limite per fascia insoddisfacente (es. `≥ 1000 UFC/g`)
- **Riferimenti bibliografici**: Fonti normative utilizzate
- **Note**: Note aggiuntive sul parametro

**Logica di valutazione:**
1. **Confronto deterministico**: Il sistema confronta automaticamente valori numerici e unità
2. **Fallback LLM**: Se il confronto automatico non è possibile, usa l'AI per valutare
3. **Gestione unità**: Conversione automatica quando possibile (es. UFC/g, UFC/cm²)
4. **Valori speciali**: Gestione di "Assente", "Non rilevato", "Rilevato"

### 4. Check Tamponi Ambientali

**Parametri utilizzati:**
- **Tipo campione**: Identificato come "environmental" o "surface"
- **Avviso automatico**: Il sistema avvisa che i limiti CEIRSA (UFC/g) non sono applicabili
- **Unità di misura**: I tamponi usano UFC/cm² invece di UFC/g

## 📊 Formato Risultati

Ogni risultato di conformità include:

```typescript
{
  name: string;              // Nome del parametro verificato
  value: string;             // Limite normativo applicato
  isCheck: boolean;         // true = conforme, false = non conforme
  description: string;       // Spiegazione della valutazione
  sources: Source[];         // Riferimenti normativi utilizzati
  matrix: {
    matrix: string;          // Matrice identificata
    product: string;         // Prodotto specifico
    category: string;        // Categoria (food/beverage/other)
    ceirsaCategory: string;  // Categoria CEIRSA (se applicabile)
    sampleType: string;      // Tipo di campione
  }
}
```

## 🛠️ Configurazione

### Variabili d'Ambiente

Crea un file `.env` nella root del progetto client (opzionale):

```env
VITE_API_URL=http://localhost:3007
```

Se non specificato, il client usa il proxy configurato in `vite.config.ts`.

### Proxy API

Il client è configurato per inoltrare le richieste API al backend:

- `/conformity-pdf` → `http://localhost:3007`
- `/custom-checks` → `http://localhost:3007`

## 📁 Struttura Progetto

```
client/
├── src/
│   ├── api/              # Client API per comunicazione backend
│   ├── components/       # Componenti React riutilizzabili
│   ├── pages/           # Pagine principali dell'applicazione
│   ├── types/           # Definizioni TypeScript
│   └── App.tsx          # Componente principale
├── public/              # File statici
├── package.json         # Dipendenze e script
└── vite.config.ts       # Configurazione Vite
```

## 🔧 Script Disponibili

- `npm run dev` - Avvia server di sviluppo con hot-reload
- `npm run build` - Compila per produzione
- `npm run preview` - Anteprima della build di produzione
- `npm run lint` - Esegue il linter ESLint

## 🎯 Categorie Supportate

Il sistema supporta automaticamente:

- 🍕 **Alimenti CEIRSA**: Categorie normative CEIRSA
- 🥤 **Bevande**: Standard normativi per bevande
- 🧪 **Tamponi Ambientali**: Campioni di superficie
- 🍦 **Gelati**: Categoria specifica alimenti
- 🥛 **Prodotti Lattiero-caseari**: Latte e derivati
- 🍖 **Carni**: Prodotti a base di carne
- 🐟 **Prodotti Ittici**: Pesce e derivati

## 💡 Note Importanti

- **Unità di misura**: Il sistema converte automaticamente unità compatibili. Se la conversione non è possibile, usa l'AI per valutare.
- **Valori limite**: Supporta notazioni come `< 100`, `≤ 10`, `≥ 10`, `10²`, `Assente`, `Rilevato`.
- **Performance**: L'analisi può richiedere alcuni secondi per PDF complessi.
- **Storage**: Le estrazioni vengono salvate automaticamente nel database per consultazione futura.

## 🐛 Troubleshooting

**Il client non si connette al backend:**
- Verifica che il server backend sia in esecuzione (`npm run api:dev`)
- Controlla che la porta 3007 sia disponibile
- Verifica le impostazioni del proxy in `vite.config.ts`

**Errori durante l'upload PDF:**
- Verifica che i file siano PDF validi
- Controlla la dimensione massima (50MB per file)
- Assicurati che il backend abbia le API keys configurate (vedi impostazioni)

**Risultati non corretti:**
- Verifica che il PDF contenga dati di analisi microbiologiche leggibili
- Controlla che la matrice sia identificata correttamente
- Usa le verifiche custom per parametri non standard

## 📚 Risorse Aggiuntive

- [Documentazione API Backend](../README.md)
- [Swagger UI](http://localhost:3007/docs) - Documentazione API interattiva (quando il backend è in esecuzione)
