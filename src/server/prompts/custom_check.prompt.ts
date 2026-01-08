import { PromptTemplate } from "@langchain/core/prompts";

export const customCheckPromptTemplate = PromptTemplate.fromTemplate(
  `
Analizza i seguenti criteri personalizzati per determinare la conformità del parametro analitico.

PARAMETRO ANALIZZATO:
- Nome: {parameter}
- Risultato: {result} {unit}
- Metodo di analisi utilizzato: {method}

CRITERI PERSONALIZZATI:
- Categoria: {categoryName}
- Parametro di riferimento: {customParameter}
- Metodo di analisi normativo: {analysisMethod}
- Limiti normativi:
  - Soddisfacente: {satisfactoryValue}
  - Accettabile: {acceptableValue}
  - Insoddisfacente: {unsatisfactoryValue}
- Riferimenti: {bibliographicReferences}
- Note: {notes}

CONTESTO DOCUMENTO ORIGINALE:
{markdownContent}

AUTO-VALUTAZIONE (DA SEGUIRE. Se non puoi confrontare unità/valori con certezza, restituisci []):
- Fascia calcolata: {autoBand}
- isCheck calcolato: {autoIsCheck}
- Limite da riportare in value (testo originale): {autoAppliedLimit}
- Motivazione: {autoRationale}

COMPITO:
Basandoti sui criteri personalizzati forniti, determina se il valore rilevato è conforme.

REGOLE DI DECISIONE (OBBLIGATORIE):
- Classifica il risultato in UNA delle 3 fasce: "soddisfacente", "accettabile", "insoddisfacente".
- CONFORMITÀ:
  - Se la fascia è "soddisfacente" ⇒ isCheck = true
  - Se la fascia è "accettabile" ⇒ isCheck = true (conforme ma in fascia di attenzione)
  - Se la fascia è "insoddisfacente" ⇒ isCheck = false

FORMATO RISPOSTA (JSON) - DEVI RESTITUIRE UN ARRAY CON 1 ELEMENTO:
[
  {{
    "name": "Nome del parametro",
    "value": "Limite usato per decidere",
    "isCheck": true/false,
    "description": "Spiegazione breve: fascia, confronto valori, motivazione.",
    "sources": [
      {{
        "id": "custom-{categoryName}-{customParameter}",
        "title": "Limiti personalizzati per {customParameter}",
        "url": null,
        "excerpt": "Limiti usati per la valutazione"
      }}
    ]
  }}
]

Se non trovi criteri chiari o non puoi confrontare, restituisci array vuoto [].

{formatInstructions}
`.trim()
);
