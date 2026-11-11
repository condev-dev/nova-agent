import { tool } from "ai";
import { z } from "zod";
import { searchChunks, listSources, getDocument } from "./rag";

async function safe<T>(fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    console.error("[tool error]", e);
    return { error: "The tool failed. Tell the user you had a technical problem." };
  }
}

export const tools = {
  search_knowledge: tool({
    description:
      "Semantic search over the knowledge base. Returns the most relevant text passages with their source names. Call it for every factual question about the documents. You may call it several times with different queries.",
    inputSchema: z.object({
      query: z.string().min(2).max(300).describe("A self-contained search query, rephrased for retrieval"),
    }),
    execute: ({ query }) =>
      safe(async () => {
        const hits = await searchChunks(query, 6);
        if (hits.length === 0) {
          return { found: false, note: "No relevant passages. Try rephrasing, or tell the user you could not find it." };
        }
        return {
          found: true,
          results: hits.map((h) => ({
            source: h.source,
            similarity: Number(h.similarity.toFixed(3)),
            text: h.content,
          })),
        };
      }),
  }),

  list_sources: tool({
    description: "List all documents in the knowledge base. Use when the user asks what you know or what documents exist.",
    inputSchema: z.object({}),
    execute: () => safe(async () => ({ sources: await listSources() })),
  }),

  read_document: tool({
    description: "Read the full text of one document by its source name (from list_sources or search results). Use for summaries or when passages are not enough.",
    inputSchema: z.object({ source: z.string().min(1).max(200) }),
    execute: ({ source }) =>
      safe(async () => {
        const text = await getDocument(source);
        return text ? { source, text } : { error: `No document named "${source}".` };
      }),
  }),
};
