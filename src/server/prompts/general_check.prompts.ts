/**
 * General check prompts used by the main checks index module.
 * Contains prompts for CEIRSA category matching and universal food safety checks.
 */

/**
 * Builds the prompt for finding the best matching CEIRSA category using LLM.
 * 
 * @param matrix - Matrix extraction result with product info
 * @param categoryNames - List of available CEIRSA category names
 * @returns The formatted prompt string
 */
export const buildCeirsaCategoryMatchingPrompt = (
  matrix: { product?: string | null; matrix?: string; description?: string | null },
  categoryNames: string[]
): string => {
  return `Sei un esperto di sicurezza alimentare e normative CEIRSA.

PRODOTTO/MATRICE DA ANALIZZARE:
- Prodotto: ${matrix.product || "non specificato"}
- Matrice: ${matrix.matrix || "non specificata"}
- Descrizione: ${matrix.description || "non specificata"}

CATEGORIE CEIRSA DISPONIBILI:
${categoryNames.map((name, i) => `${i + 1}. ${name}`).join("\n")}

COMPITO:
Identifica la categoria CEIRSA più appropriata per questo prodotto alimentare.

ESEMPI DI ASSOCIAZIONE:
- "gelato" → "Gelati e dessert a base di latte congelati"
- "crema", "formaggio", "taleggio", "mascarpone" → "Formaggi a base di latte..."
- "pizza" → "Pane e prodotti di panetteria" o "Preparazioni a base di carne"
- "pasta fresca" → "Paste alimentari"

Se il prodotto contiene formaggio o derivati del latte (crema, mascarpone, taleggio, gorgonzola, etc.):
→ Scegli la categoria "Formaggi a base di latte..." appropriata

Rispondi SOLO con il NUMERO della categoria (es. "26") o "NESSUNA". Nessuna spiegazione.`;
};

/**
 * Builds the prompt for universal food safety checks based on EU Regulation 2073/2005.
 * 
 * @param analysesJson - JSON string of analyses to evaluate
 * @param lawContext - Regulatory context from Tavily search
 * @param markdownContent - Original document content (truncated)
 * @returns The formatted prompt string
 */
export const buildUniversalFoodSafetyPrompt = (
  analysesJson: string,
  lawContext: string,
  markdownContent: string
): string => {
  return `Sei un esperto di sicurezza alimentare e normativa europea.

ANALISI DA VALUTARE:
${analysesJson}

CONTESTO NORMATIVO (da fonti esterne):
${
  lawContext ||
  "Nessun contesto normativo trovato. Basati sulla tua conoscenza del Reg. CE 2073/2005."
}

CONTESTO DOCUMENTO ORIGINALE:
${markdownContent.substring(0, 2000)}

COMPITO:
Valuta OGNI parametro analizzato secondo i criteri di sicurezza alimentare.
Basati ESCLUSIVAMENTE sulle fonti normative fornite quando disponibili.

FORMATO RISPOSTA (JSON array):
[
  {
    "name": "Nome parametro",
    "value": "Limite normativo applicato",
    "isCheck": true/false,
    "description": "Spiegazione conformità con riferimento alla fonte specifica",
    "sources": [
      {
        "id": "identificativo-fonte",
        "title": "Titolo documento normativo",
        "url": "URL della fonte se disponibile dal contesto, altrimenti null",
        "excerpt": "Estratto rilevante che supporta la decisione"
      }
    ]
  }
]

REGOLE:
- Valuta TUTTI i parametri presenti nell'analisi, nessuno escluso
- Includi Enterobacteriaceae, Pseudomonas, e qualsiasi altro parametro presente
- isCheck = true se CONFORME, false se NON CONFORME
- Per parametri igienico-sanitari senza limite specifico, usa criteri generali
- USA le URL reali dalle fonti Tavily quando disponibili
- Se non ci sono URL nel contesto, metti url: null
- NON inventare URL

JSON:`;
};
