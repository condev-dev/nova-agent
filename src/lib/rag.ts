import { supabase } from "./supabase";
import { embedQuery } from "./embed";

export const MIN_SIMILARITY = Number(process.env.MIN_SIMILARITY ?? 0.5);

export type Hit = {
  id: number;
  source: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

export async function searchChunks(query: string, k = 6): Promise<Hit[]> {
  const embedding = await embedQuery(query);
  const { data, error } = await supabase().rpc("match_chunks", {
    query_embedding: JSON.stringify(embedding),
    match_count: k,
    min_similarity: MIN_SIMILARITY,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Hit[];
}

export async function listSources(): Promise<{ source: string; title: string | null }[]> {
  const { data, error } = await supabase()
    .from("documents")
    .select("source,title")
    .order("source");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getDocument(source: string): Promise<string | null> {
  const { data, error } = await supabase()
    .from("chunks")
    .select("chunk_index,content")
    .eq("source", source)
    .order("chunk_index");
  if (error) throw new Error(error.message);
  if (!data?.length) return null;
  return data.map((c) => c.content).join("\n\n").slice(0, 15000);
}
