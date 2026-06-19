import { defineTool } from "eve/tools";
import { z } from "zod";
import { search } from "../../lib/index.js";

export default defineTool({
  description:
    "Search the corpus of internal VC records (emails, meeting notes, deal memos, founder updates) for information relevant to a query. Returns the most relevant text chunks with their source file and line numbers. Always search before making factual claims.",
  inputSchema: z.object({
    query: z.string().describe("Natural language query to search for in the records corpus"),
    topK: z
      .number()
      .optional()
      .default(5)
      .describe("Number of results to return (default 5, max 10)"),
  }),
  async execute({ query, topK }) {
    const results = await search(query, Math.min(topK ?? 5, 10));

    if (results.length === 0) {
      return {
        results: [],
        message: "No relevant records found for this query.",
      };
    }

    return {
      results: results.map((r) => ({
        citation: `[${r.filename}:${r.lineStart}-${r.lineEnd}]`,
        filename: r.filename,
        lineStart: r.lineStart,
        lineEnd: r.lineEnd,
        metadata: r.metadata,
        text: r.text,
      })),
    };
  },
});
