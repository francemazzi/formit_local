import { PromptTemplate } from "@langchain/core/prompts";

export const ceirsaCompliancePromptTemplate = PromptTemplate.fromTemplate(
  `
Analizza i seguenti criteri normativi CEIRSA per determinare la conformità del parametro analitico.

PARAMETRO ANALIZZATO:
- Nome: {parameter}
- Risultato: {result} {unit}
- Metodo di analisi utilizzato: {method}

CRITERI NORMATIVI CEIRSA:
- Categoria CEIRSA: {categoryName} (ID: {categoryId})
- Parametro CEIRSA: {ceirsaParameter}
- Criterio microbiologico: {microbiologicalCriterion}
- Metodo di analisi normativo: {analysisMethod}
- Limiti normativi:
{ceirsaLimits}
- Limiti normativi (normalizzati solo per chiarezza; i valori originali restano invariati):
{normalizedCeirsaLimits}
- Riferimenti bibliografici: {bibliographicReferences}
- Note: {notes}

CONTESTO DOCUMENTO ORIGINALE:
{markdownContent}

AUTO-VALUTAZIONE (DA SEGUIRE. Se non puoi confrontare unità/valori con certezza, restituisci []):
- Fascia calcolata: {autoBand}
- isCheck calcolato: {autoIsCheck}
- Limite da riportare in value (testo originale): {autoAppliedLimit}
- Motivazione: {autoRationale}

COMPITO:
Basandoti ESCLUSIVAMENTE sui criteri normativi CEIRSA forniti, determina se il valore rilevato è conforme.

REGOLE DI DECISIONE (OBBLIGATORIE):
- Devi classificare il risultato in UNA delle 3 fasce: "soddisfacente", "accettabile", "insoddisfacente".
- **CONFORMITÀ**:
  - Se la fascia è "soddisfacente" ⇒ **isCheck = true**
  - Se la fascia è "accettabile" ⇒ **isCheck = true** (conforme ma in fascia di attenzione)
  - Se la fascia è "insoddisfacente" ⇒ **isCheck = false**
- **NON dichiarare "insoddisfacente"** se il valore è chiaramente sotto la soglia "insoddisfacente" (quando presente).
- Se nei criteri CEIRSA manca la fascia "accettabile", usa solo "soddisfacente" vs "insoddisfacente" se possibile; altrimenti spiega perché non determinabile e restituisci [].

INTERPRETAZIONE VALORI (OBBLIGATORIA):
- Interpreta correttamente notazioni tipo "< 100", "≤ 10", "≥ 10", "Assente", "Non rilevato", "Rilevato".
- Se il criterio richiede "Assente" e il risultato è "Rilevato" ⇒ **insoddisfacente**.
- Se il risultato è sotto LOQ ("< X") e i limiti indicano una soglia più bassa, **non inventare positività**: valuta sulla base di quanto disponibile e motivando.

UNITÀ DI MISURA:
- Se unità tra risultato e limite non sono confrontabili/conversione non possibile con certezza, NON indovinare: restituisci [].

FORMATO RISPOSTA (JSON) - DEVI RESTITUIRE UN ARRAY CON 1 ELEMENTO:
[
  {{
    "name": "Deve essere ESATTAMENTE il nome del parametro CEIRSA (ceirsaParameter)",
    "value": "Deve essere il TESTO ESATTO del limite usato per decidere (es. '<102 (ufc/g)' oppure '10≤ x <102 (ufc/g)' oppure '≥102 (ufc/g)' oppure 'Assente (...)')",
    "isCheck": true/false,
    "description": "Spiegazione breve e precisa: indica la fascia (soddisfacente/accettabile/insoddisfacente), confronta numeri e operatori, e ribadisci che 'accettabile' è conforme ma in attenzione.",
    "sources": [
      {{
        "id": "ceirsa-{categoryId}-{ceirsaParameter}",
        "title": "Limiti normativi CEIRSA per {ceirsaParameter}",
        "url": null,
        "excerpt": "Riporta esattamente i limiti CEIRSA usati (incluso soddisfacente/accettabile/insoddisfacente)"
      }}
    ]
  }}
]

IMPORTANTE:
- Usa SOLO le informazioni presenti nei criteri CEIRSA forniti
- Se non trovi un parametro corrispondente o criteri chiari, restituisci array vuoto []
- Considera attentamente le differenze nelle unità di misura e converti quando possibile
- Interpreta correttamente i valori numerici e le notazioni (es. "< 10", "≥ 10", "Assente")
- Per ogni check, includi sempre almeno una source con id, title, url (null) ed excerpt
- L'id della source deve essere nel formato: ceirsa-{categoryId}-{parameter} o ceirsa-notes-{categoryId}-{parameter}
- Se ci sono riferimenti bibliografici, includili nella source. Se ci sono note, includile come source separata

{formatInstructions}
`.trim()
);

export const ceirsaParameterEquivalencePrompt = `Sei un esperto di microbiologia alimentare. Determina se questi due parametri microbiologici sono equivalenti o riferiti allo stesso tipo di analisi.

PARAMETRO DALL'ANALISI: "{analysisParam}"
PARAMETRO CEIRSA: "{ceirsaParam}"

Considera che:
- I nomi possono essere abbreviati o scritti in modo diverso (es. "CBT" = "Conta Batterica Totale" = "Microrganismi mesofili aerobi")
- Possono essere usati sinonimi scientifici o nomi comuni
- Le unità di misura possono variare ma il parametro essere lo stesso

Rispondi SOLO con "true" se sono equivalenti, "false" altrimenti. Nessuna spiegazione.`;
