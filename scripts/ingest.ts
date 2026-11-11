import fs from "node:fs/promises";
import path from "node:path";
import { supabase } from "../src/lib/supabase";
import { chunkText } from "../src/lib/chunk";
import { embedDocuments } from "../src/lib/embed";

async function main() {
  const dir = path.join(process.cwd(), "data");
  const files = (await fs.readdir(dir)).filter((f) => /\.(md|txt)$/i.test(f));
  if (!files.length) throw new Error("data/ has no .md or .txt files");
  const db = supabase();

  for (const file of files) {
    const source = file.replace(/\.(md|txt)$/i, "");
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? source;
    const chunks = chunkText(raw);
    console.log(`${file}: ${chunks.length} chunks`);

    const embeddings = await embedDocuments(chunks.map((c) => `${title}\n\n${c}`));
    if (embeddings.length !== chunks.length) {
      throw new Error(`Embedding mismatch for ${file}: ${embeddings.length} != ${chunks.length}`);
    }

    const { error: delErr } = await db.from("documents").delete().eq("source", source);
    if (delErr) throw delErr;

    const { data: doc, error: docErr } = await db
      .from("documents")
      .insert({ source, title })
      .select("id")
      .single();
    if (docErr) throw docErr;

    const rows = chunks.map((content, i) => ({
      document_id: doc.id,
      source,
      chunk_index: i,
      content,
      embedding: JSON.stringify(embeddings[i]),
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await db.from("chunks").insert(rows.slice(i, i + 100));
      if (error) throw error;
    }
  }
  console.log("Done ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
