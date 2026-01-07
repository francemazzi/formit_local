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

CONTESTO NORMATIVO (ricerca web Tavily):
{tavilyContext}

⚠️ REGOLA CRITICA - UNITÀ DI MISURA INCOMPATIBILI:
I tamponi ambientali misurano la carica microbica su SUPERFICI e utilizzano l'unità di misura UFC/cm² (unità formanti colonia per centimetro quadrato).

I limiti CEIRSA sono definiti per ALIMENTI e utilizzano l'unità di misura UFC/g (unità formanti colonia per grammo).

⚠️ NON ESISTE UNA CONVERSIONE VALIDA tra UFC/cm² (superfici) e UFC/g (alimenti).
Queste unità misurano entità completamente diverse:
- UFC/cm² misura la contaminazione microbica su una superficie
- UFC/g misura la contaminazione microbica in un alimento

COMPITO:
Valuta OGNI parametro analizzato nel tampone ambientale confrontando il risultato con i limiti normativi trovati nel contesto normativo (Tavily).

IMPORTANTE:
- I risultati sono espressi in UFC/cm² e NON possono essere confrontati con i limiti CEIRSA per alimenti (UFC/g)
- ANALIZZA ATTENTAMENTE il contesto normativo (Tavily) per trovare limiti specifici per superfici/tamponi ambientali
- Se trovi limiti chiari nel contesto normativo:
  * Confronta il risultato numerico con il limite trovato
  * Se il risultato è SUPERIORE al limite → isCheck = false (NON CONFORME)
  * Se il risultato è INFERIORE o UGUALE al limite → isCheck = true (CONFORME)
  * Nella description spiega il confronto: "Risultato: X UFC/cm². Limite normativo: Y UFC/cm². [Conforme/Non conforme]"
- Se NON trovi limiti chiari o non puoi determinare con certezza → isCheck = null (DA CONFERMARE)
- Nella description includi sempre l'avviso che i limiti CEIRSA non sono applicabili

FORMATO RISPOSTA (JSON array):
[
  {{
    "name": "Nome parametro",
    "value": "Risultato con unità di misura (es. '18 UFC/cm²')",
    "isCheck": true/false/null,
    "description": "Descrizione completa con confronto risultato vs limite normativo",
    "sources": [
      {{
        "id": "environmental-swab-warning",
        "title": "Avviso: Unità di misura non comparabili",
        "url": null,
        "excerpt": "UFC/cm² (superfici) ≠ UFC/g (alimenti). Necessari limiti specifici per superfici."
      }}
    ]
  }}
]

REGOLE PER isCheck:
- isCheck = true → se il risultato è CONFORME rispetto ai limiti trovati nel contesto normativo
- isCheck = false → se il risultato è NON CONFORME (supera i limiti trovati)
- isCheck = null → se NON trovi limiti chiari nel contesto normativo o non puoi determinare con certezza

REGOLE GENERALI:
- Restituisci UN risultato per OGNI parametro analizzato
- value deve contenere il RISULTATO EFFETTIVO dell'analisi con la sua unità di misura (es. "18 UFC/cm²", "non rilevato", ecc.)
- NON usare "N/A" nel campo value - mostra sempre il risultato reale dell'analisi
- description deve includere:
  1. L'avviso che i limiti CEIRSA non sono applicabili
  2. Il confronto tra risultato e limite normativo (se trovato)
  3. La motivazione della decisione (conforme/non conforme/da confermare)
- Se nel contesto normativo (Tavily) trovi limiti specifici, estrai il valore numerico e confrontalo con il risultato
- sources: includi SEMPRE l'avviso sulle unità di misura non comparabili come prima fonte
- Le fonti Tavily verranno aggiunte automaticamente dal sistema, NON includerle manualmente

{formatInstructions}
`.trim());

