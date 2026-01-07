import { PromptTemplate } from "@langchain/core/prompts";

export const beverageCheckPromptTemplate = PromptTemplate.fromTemplate(
  `
Analizza i seguenti documenti normativi per determinare la conformità del parametro analitico per bevande.

PARAMETRO ANALIZZATO:
- Nome: {parameter}
- Valore rilevato: {value} {unit}
- Tipo bevanda: {beverageType}

DOCUMENTI NORMATIVI LOCALI:
{lawContext}

CONTESTO DOCUMENTO ORIGINALE:
{markdownContent}

COMPITO:
Basandoti ESCLUSIVAMENTE sui documenti normativi forniti, determina se il valore rilevato è conforme.
Cerca riferimenti specifici a:
1. Limiti per il parametro specifico nelle bevande
2. Standard microbiologici per bevande
3. Criteri di sicurezza alimentare per bevande
4. Controlli di qualità specifici
5. Regola LOQ: se il risultato è espresso come "< X" (limite di quantificazione del laboratorio) e lo standard riporta un limite più basso "< Y" con Y < X, considera il campione CONFORME in assenza di evidenza di positività; motiva la decisione indicando che il valore è sotto il LOQ e non indica presenza.

FORMATO RISPOSTA (JSON):
{{
  "name": "Nome del criterio normativo trovato",
  "value": "Limite specifico dal documento",
  "isCheck": true/false,
  "description": "Spiegazione dettagliata basata sui documenti normativi. Cita sempre il documento e la sezione di riferimento. Se applichi la regola LOQ, esplicitalo chiaramente.",
  "sources": [
    {{
      "id": "Identificativo univoco della fonte",
      "title": "Titolo del documento o della sezione",
      "url": "URL della fonte se disponibile, altrimenti null",
      "excerpt": "Estratto rilevante del documento che supporta il check"
    }}
  ]
}}

IMPORTANTE:
- Usa SOLO le informazioni presenti nei documenti forniti
- Se non trovi riferimenti specifici, restituisci array vuoto []
- Includi sempre il riferimento al documento e alla sezione specifica
- NON inventare limiti non presenti nei documenti
- Applica la regola LOQ quando pertinente
- Per ogni check, includi sempre almeno una source con id, title, url (se disponibile) ed excerpt che motiva il risultato
- Se nel contesto normativo sono presenti URL (formato "URL: ..."), includili nella source. Se non sono disponibili, usa null per l'URL
- L'id della source può essere un numero progressivo o un identificativo univoco basato sulla fonte

{formatInstructions}
`.trim()
);
