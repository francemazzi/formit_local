export const extractAnalysesPrompt = {
  prompt: `Sei un esperto nell'estrazione di dati analitici da rapporti di laboratorio.
Analizza il seguente contenuto markdown ed estrai TUTTI i parametri analitici microbiologici presenti.

Cerca parametri come:
- Conta Escherichia coli
- Conta Stafilococchi coagulasi-positivi
- Salmonella
- Listeria monocytogenes
- Enterobatteri
- Conta batterica totale
- E. coli
- Staphylococcus aureus
- E qualsiasi altro parametro microbiologico

IMPORTANTE:
- Estrai sia i parametri dalle tabelle che dal testo
- Gestisci qualsiasi formato di tabella (markdown, HTML, testo)
- Preserva i valori esatti con operatori (<, >, ≤, ≥, =)
- Includi sempre le unità di misura (UFC/cm2, UFC/g, UFC/ml, etc.)
- Gestisci valori come "< 1", "13", "Assente", "Presente"

Restituisci ESCLUSIVAMENTE un array JSON con questa struttura:
[
  {
    "Parametro": "Nome completo del parametro microbiologico",
    "Risultato": "Valore trovato (es. < 1, 13, Assente)",
    "U.M.": "Unità di misura (es. UFC/cm2, UFC/g, UFC/ml)",
    "Metodo": "Metodo di analisi se disponibile (opzionale)"
  }
]

Se non trovi parametri analitici, restituisci un array vuoto [].

Contenuto da analizzare:
{markdownContent}

JSON:
`,
} as const;
