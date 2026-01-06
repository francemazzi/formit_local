export const extractMatrixPrompt = {
  prompt: `Sei un esperto di sicurezza alimentare incaricato di inferire i metadati relativi alla matrice campionata a partire da un rapporto di prova in formato markdown.

Analizza attentamente il contenuto e ricava sempre:
1. "matrix" → tipologia del campione (es. "Tampone ambientale", "Prodotto alimentare", "Tampone al personale").
2. "description" → descrizione sintetica dell'oggetto o superficie campionata (es. "Paletta gelato", "Banco acciaio").
3. "product" → prodotto specifico SE E SOLO SE è un campione alimentare diretto (non applicabile per tamponi su superfici).
4. "category" → scegli SOLO tra "food", "beverage", "other".
5. "ceirsa_category" → scegli la categoria CEIRSA più adatta dall'elenco fornito; restituisci null se nessuna si applica O se è un tampone ambientale/superficie.
6. "specialFeatures" → elenco di attributi rilevanti (es. "personale", "superficie acciaio"). Se non presenti, restituisci [].
7. "sampleType" → CRITICO! Scegli tra:
   - "environmental_swab" → tamponi su superfici, attrezzature, utensili (misurati in UFC/cm²)
   - "food_product" → campioni di alimento/prodotto alimentare diretto (misurati in UFC/g)
   - "personnel_swab" → tamponi al personale (mani, operatori)
   - "water" → campioni di acqua
   - "other" → altro

⚠️ REGOLA FONDAMENTALE - DISTINZIONE SUPERFICI vs ALIMENTI:
Un TAMPONE su una superficie (paletta, banco, coltello, attrezzatura) NON è un campione di ALIMENTO.
- "Tampone su paletta gelato" → sampleType: "environmental_swab", category: "other", ceirsa_category: null
- "Tampone su banco acciaio" → sampleType: "environmental_swab", category: "other", ceirsa_category: null
- "Campione di gelato" (il prodotto stesso) → sampleType: "food_product", category: "food", ceirsa_category: appropriata

I tamponi ambientali usano UFC/cm² e NON possono essere confrontati con limiti CEIRSA per alimenti (UFC/g).

INDICATORI CHIAVE DA CERCARE:
- Riferimenti a "superficie", "attrezzatura", "tampone", "banco", "paletta", "utensile" → sampleType: "environmental_swab", category: "other".
- Campione diretto di alimento (es. "campione di gelato", "campione di pizza") → sampleType: "food_product", category: "food".
- "Gelateria", "Pizzeria" nel nome cliente → indica il contesto, ma NON il tipo di campione.
- "Bar" o "Caffetteria" → contesto, NON tipo campione.
- "Campionamento personale" o riferimenti a operatori/mani → sampleType: "personnel_swab", category: "other".

CATEGORIE CEIRSA DISPONIBILI (applica SOLO per sampleType "food_product"):
{ceirsaCategories}

CONTENUTO DEL DOCUMENTO:
{markdownContent}

Rispondi ESCLUSIVAMENTE con un JSON valido nel formato seguente:
{{
  "matrix": "string",
  "description": "string | null",
  "product": "string | null (null se tampone su superficie)",
  "category": "food | beverage | other",
  "ceirsa_category": "string | null (SEMPRE null per tamponi ambientali)",
  "specialFeatures": "string[]",
  "sampleType": "environmental_swab | food_product | personnel_swab | water | other"
}}
`,
} as const;

export const fallbackMatrixPrompt = {
  prompt: `Analizza il seguente contenuto di un rapporto di prova e inferisci le informazioni sulla matrice del campione.

Cerca nel testo:
1. Tipo di campione (es. "Tampone ambientale", "Prodotto alimentare", "Superficie", ecc.).
2. Descrizione del campione (es. "Paletta gelato", "Superficie di lavoro", ecc.).
3. Prodotto specifico SOLO se è un campione diretto di alimento.
4. Categoria del prodotto ("food", "beverage", "other").
5. Categoria CEIRSA appropriata dalla lista fornita (SOLO per campioni alimentari diretti).
6. Tipo di campione (sampleType) - CRITICO per determinare se applicare limiti CEIRSA.

⚠️ REGOLA FONDAMENTALE - DISTINZIONE SUPERFICI vs ALIMENTI:
Un TAMPONE su una superficie (paletta, banco, coltello) NON è un campione di ALIMENTO.
I tamponi ambientali usano UFC/cm² (superfici) e NON possono essere confrontati con limiti CEIRSA per alimenti (UFC/g).

CATEGORIE CEIRSA DISPONIBILI (applica SOLO per sampleType "food_product"):
{ceirsaCategories}

INDICATORI CHIAVE DA CERCARE:
- "Paletta gelato", "banco", "superficie", "attrezzatura" → sampleType: "environmental_swab", category: "other", ceirsa_category: null.
- Campione diretto di alimento → sampleType: "food_product", category: "food".
- "Gelateria", "Pizzeria" nel cliente → contesto, NON tipo campione.
- "Tampone" + superficie → sampleType: "environmental_swab", category: "other".
- "Campionamento personale", "mano operatore" → sampleType: "personnel_swab", category: "other".

Contenuto del documento:
{markdownContent}

Rispondi con un oggetto JSON nel seguente formato:
{{
  "matrix": "tipo di matrice inferito",
  "description": "descrizione del campione se trovata",
  "product": "null per tamponi su superfici, prodotto se campione alimentare",
  "category": "food/beverage/other",
  "ceirsa_category": "null per tamponi, categoria appropriata per alimenti",
  "specialFeatures": [],
  "sampleType": "environmental_swab | food_product | personnel_swab | water | other"
}}

Fornisci SOLO il JSON, senza testo aggiuntivo.
`,
} as const;
