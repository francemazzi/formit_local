import { PromptTemplate } from "@langchain/core/prompts";

export const environmentalSwabCheckPrompt = PromptTemplate.fromTemplate(`
Sei un esperto di sicurezza alimentare e igiene delle superfici.

ANALISI DA VALUTARE:
{analysesJson}

INFORMAZIONI SUL CAMPIONE:
- Tipo: Tampone ambientale/superficie
- Matrice: {matrix}
- Descrizione: {description}
- Tipo di campione: {sampleType}

CONTESTO DOCUMENTO ORIGINALE:
{markdownContent}

CONTESTO NORMATIVO (ricerca web Tavily) - FONTE AUTOREVOLE PER I LIMITI:
{tavilyContext}

⚠️ NOTA IMPORTANTE:
I limiti CEIRSA sono definiti per ALIMENTI (UFC/g) e NON sono applicabili ai tamponi ambientali (UFC/cm²).
DEVI usare i limiti trovati nel CONTESTO NORMATIVO (Tavily) sopra per valutare la conformità.

COMPITO:
1. LEGGI ATTENTAMENTE il contesto normativo (Tavily) per ESTRARRE i limiti per superfici/tamponi
2. CONFRONTA il risultato numerico con i limiti trovati
3. EMETTI un VERDETTO chiaro (conforme/non conforme)

LIMITI DI RIFERIMENTO COMUNI PER SUPERFICI (da usare se trovati nel contesto Tavily):
- Microrganismi mesofili/Conta totale: generalmente 4 UFC/cm² (superfici di lavorazione), 1 UFC/cm² (utensili a contatto diretto)
- Enterobatteri: generalmente < 1 UFC/cm²
- Coliformi totali: generalmente < 1 UFC/cm²
- Stafilococchi coagulasi positivi: generalmente assenti

REGOLE DI DECISIONE (OBBLIGATORIE):
1. Se il CONTESTO NORMATIVO (Tavily) contiene un limite numerico per il parametro:
   - ESTRAI il valore numerico del limite (es. "4 UFC/cm²")
   - CONFRONTA con il risultato dell'analisi
   - Se risultato ≤ limite → isCheck = TRUE (CONFORME)
   - Se risultato > limite → isCheck = FALSE (NON CONFORME)

2. ESEMPI CONCRETI:
   - Risultato "33 UFC/cm²", limite trovato "4 UFC/cm²" → 33 > 4 → isCheck = FALSE (NON CONFORME)
   - Risultato "2 UFC/cm²", limite trovato "4 UFC/cm²" → 2 ≤ 4 → isCheck = TRUE (CONFORME)
   - Risultato "< 1 UFC/cm²", limite trovato "4 UFC/cm²" → < 1 ≤ 4 → isCheck = TRUE (CONFORME)

3. SOLO se NON trovi NESSUN limite nel contesto normativo → isCheck = null

FORMATO RISPOSTA (JSON array):
[
  {{
    "name": "Nome parametro",
    "value": "Limite normativo applicato (es. '≤ 4 UFC/cm²' o 'Assente')",
    "isCheck": true/false/null,
    "description": "Risultato: X UFC/cm². Limite normativo per superfici: Y UFC/cm². Esito: CONFORME/NON CONFORME. [motivazione]",
    "sources": [
      {{
        "id": "surface-limit-source",
        "title": "Limite microbiologico superfici",
        "url": null,
        "excerpt": "Limite applicato: Y UFC/cm² (fonte: [nome fonte dal contesto Tavily])"
      }}
    ]
  }}
]

REGOLE FORMATO:
- name: Nome del parametro analizzato
- value: Il LIMITE NORMATIVO applicato (NON il risultato dell'analisi)
- isCheck: true (conforme) / false (non conforme) / null (solo se nessun limite trovato)
- description: DEVE contenere:
  1. Il RISULTATO dell'analisi (es. "33 UFC/cm²")
  2. Il LIMITE normativo trovato (es. "4 UFC/cm²")
  3. Il VERDETTO chiaro: "CONFORME" o "NON CONFORME"
  4. Breve motivazione del confronto
- sources: Fonti normative usate per il limite

{formatInstructions}
`.trim());

