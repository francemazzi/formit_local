export const extractMatrixPrompt = {
  prompt: `Sei un esperto di sicurezza alimentare incaricato di inferire i metadati relativi alla matrice campionata a partire da un rapporto di prova in formato markdown.

Analizza attentamente il contenuto e ricava sempre:
1. "matrix" → tipologia del campione (es. "Tampone ambientale", "Prodotto alimentare", "Tampone al personale").
2. "description" → descrizione sintetica dell'oggetto o superficie campionata (es. "Paletta gelato", "Banco acciaio").
3. "product" → prodotto specifico se citato (es. gelato, pizza, caffè, ecc.).
4. "category" → scegli SOLO tra "food", "beverage", "other".
5. "ceirsa_category" → scegli la categoria CEIRSA più adatta dall'elenco fornito; restituisci null se nessuna si applica.
6. "specialFeatures" → elenco di attributi rilevanti (es. "personale", "superficie acciaio"). Se non presenti, restituisci [].

INDICATORI CHIAVE DA CERCARE:
- "Paletta gelato" → matrix "Tampone ambientale", product "gelato", category "food".
- "Gelateria" → product "gelato", category "food".
- "Pizzeria" → product "pizza", category "food".
- "Bar" o "Caffetteria" → product "caffè", category "beverage".
- "Tampone" associato a una superficie → matrix "Tampone ambientale".
- "Campionamento personale" o riferimenti a operatori → matrix "Tampone al personale", category "other".

CATEGORIE CEIRSA DISPONIBILI (scegli la più pertinente):
{ceirsaCategories}

CONTENUTO DEL DOCUMENTO:
{markdownContent}

Rispondi ESCLUSIVAMENTE con un JSON valido nel formato seguente:
{{
  "matrix": "string",
  "description": "string | null",
  "product": "string | null",
  "category": "food | beverage | other",
  "ceirsa_category": "string | null",
  "specialFeatures": "string[]"
}}
`,
} as const;

export const fallbackMatrixPrompt = {
  prompt: `Analizza il seguente contenuto di un rapporto di prova e inferisci le informazioni sulla matrice del campione.

Cerca nel testo:
1. Tipo di campione (es. "Tampone ambientale", "Prodotto alimentare", "Superficie", ecc.).
2. Descrizione del campione (es. "Paletta gelato", "Superficie di lavoro", ecc.).
3. Prodotto specifico (es. "gelato", "pizza", "caffè", ecc.).
4. Categoria del prodotto ("food", "beverage", "other").
5. Categoria CEIRSA appropriata dalla lista fornita.

CATEGORIE CEIRSA DISPONIBILI:
{ceirsaCategories}

INDICATORI CHIAVE DA CERCARE:
- "Paletta gelato" → matrix: "Tampone ambientale", product: "gelato", category: "food".
- "Gelateria" → product: "gelato", category: "food".
- "Pizzeria" → product: "pizza", category: "food".
- "Bar", "Caffetteria" → product: "caffè", category: "beverage".
- "Tampone" + superficie → matrix: "Tampone ambientale".
- "Campionamento personale" → matrix: "Tampone al personale", category: "other".

Contenuto del documento:
{markdownContent}

Rispondi con un oggetto JSON nel seguente formato:
{{
  "matrix": "tipo di matrice inferito",
  "description": "descrizione del campione se trovata",
  "product": "prodotto specifico se identificato",
  "category": "food/beverage/other",
  "ceirsa_category": "categoria CEIRSA appropriata o null",
  "specialFeatures": []
}}

Fornisci SOLO il JSON, senza testo aggiuntivo.
`,
} as const;
