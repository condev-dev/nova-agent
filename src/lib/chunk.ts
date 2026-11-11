export function chunkText(text: string, maxChars = 1200, overlap = 150): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    if (current && current.length + p.length + 2 > maxChars) {
      chunks.push(current);

      const tail = current.slice(-overlap).replace(/^\S*\s/, "");
      current = tail ? `${tail}\n\n${p}` : p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }
  if (current) chunks.push(current);

  return chunks.flatMap((c) => {
    if (c.length <= maxChars * 1.5) return [c];
    const parts: string[] = [];
    for (let i = 0; i < c.length; i += maxChars) parts.push(c.slice(i, i + maxChars));
    return parts;
  });
}
