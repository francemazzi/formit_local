export const extractAnalysesPrompt = {
  prompt: `Sei un esperto nell'estrazione di dati da rapporti di laboratorio.

OBIETTIVO: Estrai TUTTI i parametri analitici presenti nel documento, senza eccezioni.

COME RICONOSCERE I DATI DA ESTRARRE:
I rapporti di laboratorio contengono tipicamente una sezione "Risultati analitici" con una tabella strutturata.
Cerca colonne con intestazioni come: "Parametro", "U.M.", "Risultato", "Metodo", "Incertezza".
Ogni riga della tabella rappresenta un parametro da estrarre.

REGOLE DI ESTRAZIONE:
1. Estrai OGNI riga della tabella dei risultati - non importa quale sia il nome del parametro
2. Il nome del parametro può essere qualsiasi cosa: microbiologico, chimico, fisico, allergene, etc.
3. Preserva i valori esatti come appaiono: <, >, ≤, ≥, < 10, < 1, "Non rilevato", etc.
4. L'unità di misura può essere: UFC/g, UFC/cm², R/NR in 25 g, mg/kg, ppm, %, o qualsiasi altra
5. Il metodo può essere: ISO, AFNOR, UNI EN, o qualsiasi riferimento normativo
6. Se un campo non è presente, lascialo vuoto o usa "_"
7. NON filtrare i parametri - estrai TUTTO ciò che è presente nella tabella

FORMATO OUTPUT - Array JSON con tutti i parametri trovati:
[
  {
    "Parametro": "Nome esatto del parametro come appare nel documento",
    "Risultato": "Valore esatto (es. < 10, Non rilevato, 5.2, Assente)",
    "U.M.": "Unità di misura o _ se non presente",
    "Metodo": "Metodo di analisi o _ se non presente"
  }
]

Se non trovi parametri analitici, restituisci [].

Contenuto da analizzare:
{markdownContent}

JSON:
`,
} as const;
