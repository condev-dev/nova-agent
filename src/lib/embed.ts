import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

const model = google.textEmbeddingModel("gemini-embedding-001");
export const EMBEDDING_DIM = 768;

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const { embeddings } = await embedMany({
      model,
      values: texts.slice(i, i + 50),
      maxRetries: 5,
      providerOptions: {
        google: { outputDimensionality: EMBEDDING_DIM, taskType: "RETRIEVAL_DOCUMENT" },
      },
    });
    out.push(...embeddings);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model,
    value: text,
    maxRetries: 3,
    providerOptions: {
      google: { outputDimensionality: EMBEDDING_DIM, taskType: "RETRIEVAL_QUERY" },
    },
  });
  return embedding;
}
