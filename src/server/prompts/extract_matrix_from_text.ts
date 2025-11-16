export const extractMatrixPrompt = {
  prompt: `You are a food safety expert specialized in identifying sample matrices from laboratory reports.
Analyze the provided markdown text and infer the metadata about the sampled matrix.

Always determine:
1. "matrix" → the high-level type of the sample (e.g. "Tampone ambientale", "Prodotto alimentare").
2. "description" → a concise description of the sampled item or surface.
3. "product" → the specific product (e.g. gelato, pizza, caffe) when clearly indicated.
4. "category" → choose ONLY among "food", "beverage", "other".
5. "ceirsa_category" → pick the best fitting CEIRSA category name from the provided list or return null.
6. "specialFeatures" → array of notable qualifiers (e.g. "personale", "superficie acciaio"). Return [] if none.

Useful hints:
- Mentions of "tampone", "superficie" or "ambientale" usually imply matrix "Tampone ambientale".
- References to specific utensils (paletta, coltello, banco) are typically surfaces: matrix "Tampone ambientale".
- Mentions of restaurants or shops may help infer the product (gelateria → gelato, pizzeria → pizza, bar → caffe).
- "Campionamento personale" or operators indicate matrix "Tampone al personale", category "other".

CEIRSA CATEGORIES (choose the closest match or null if none fits):
{ceirsaCategories}

Document content to analyze:
{markdownContent}

Reply ONLY with a valid JSON object using this structure:
{
  "matrix": "string",
  "description": "string | null",
  "product": "string | null",
  "category": "food | beverage | other",
  "ceirsa_category": "string | null",
  "specialFeatures": "string[]"
}
`,
} as const;
