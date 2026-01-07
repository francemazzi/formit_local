export const extractAnalysesPrompt = {
  prompt: `Sei un esperto nell'estrazione di dati analitici da rapporti di laboratorio.
Analizza il seguente contenuto ed estrai TUTTI i parametri analitici presenti, inclusi:

PARAMETRI MICROBIOLOGICI come per esempio:
- Conta Escherichia coli, E. coli
- Conta Stafilococchi coagulasi-positivi, Staphylococcus aureus
- Salmonella
- Listeria monocytogenes
- Enterobatteri, Enterobacteriaceae
- Conta batterica totale, Carica microbica
- Coliformi totali, Coliformi fecali
- Muffe e lieviti
- Bacillus cereus
- Clostridium perfringens

ALLERGENI (PCR/ELISA) come per esempio:
- Allergene arachide
- Allergene mandorla
- Allergene noce
- Allergene senape
- Allergene soia
- Allergene latte
- Allergene uova
- Allergene glutine/grano/frumento
- Allergene pesce
- Allergene crostacei
- Allergene sedano
- Allergene lupino
- Allergene sesamo
- Allergene molluschi
- Allergene solfiti
- Qualsiasi altro allergene

ALTRI PARAMETRI:
- pH, Aw (attività dell'acqua)
- Qualsiasi parametro chimico-fisico
- Qualsiasi altro parametro di laboratorio

REGOLE DI ESTRAZIONE:
- Estrai TUTTI i parametri presenti, non solo microbiologici
- Gestisci qualsiasi formato di tabella (markdown, HTML, testo separato)
- Preserva i valori esatti: <, >, ≤, ≥, =
- Per allergeni: "rilevato", "non rilevato", "presente", "assente"
- Includi unità di misura se disponibili (UFC/cm², UFC/g, mg/kg, ppm, etc.)
- Se U.M. non disponibile, usa "_" o lascia vuoto

Restituisci ESCLUSIVAMENTE un array JSON:
[
  {
    "Parametro": "Nome completo del parametro",
    "Risultato": "Valore trovato (es. < 1, rilevato, non rilevato, Assente)",
    "U.M.": "Unità di misura (es. UFC/cm², UFC/g, mg/kg) o _ se non disponibile",
    "Metodo": "Metodo di analisi se disponibile"
  }
]

Se non trovi parametri analitici, restituisci [].

Contenuto da analizzare:
{markdownContent}

JSON:
`,
} as const;
