import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, "../../../data/index.json");
const OR_KEY = process.env.OPENROUTER_API_KEY!;

interface Chunk {
  id: string; filename: string; lineStart: number; lineEnd: number;
  text: string; embedding?: number[]; metadata: Record<string, string>;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OR_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/text-embedding-3-small", input: texts }),
  });
  if (!res.ok) throw new Error(`Embed error ${res.status}: ${await res.text()}`);
  const d = await res.json() as { data: { embedding: number[] }[] };
  return d.data.map(x => x.embedding);
}

function cosine(a: number[], b: number[]): number {
  let dot=0, na=0, nb=0;
  for (let i=0; i<a.length; i++) { dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function search(query: string, topK = 8): Promise<Omit<Chunk,"embedding">[]> {
  if (!fs.existsSync(INDEX_PATH)) throw new Error("Index not built. Run: npm run index");
  const chunks: Chunk[] = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  const [qe] = await embedTexts([query]);
  return chunks
    .filter(c => c.embedding)
    .map(c => ({ ...c, score: cosine(qe, c.embedding!) }))
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, topK)
    .map(({ embedding: _, ...r }) => r);
}
