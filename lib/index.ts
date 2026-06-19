import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import OpenAI from "openai";

const RECORDS_DIR = path.join(process.cwd(), "data", "records");
const INDEX_PATH = path.join(process.cwd(), "data", "index.json");

interface Chunk {
  id: string;
  filename: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  embedding?: number[];
  metadata: {
    date?: string;
    type?: string;
    from?: string;
    subject?: string;
  };
}

function extractMetadata(lines: string[]): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of lines.slice(0, 8)) {
    const m = line.match(/^(Date|Type|From|To|Subject|Author|Re|Attendees):\s*(.+)/i);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
  }
  return meta;
}

function chunkFile(filename: string, content: string): Omit<Chunk, "embedding">[] {
  const lines = content.split("\n");
  const metadata = extractMetadata(lines);
  const chunks: Omit<Chunk, "embedding">[] = [];
  const CHUNK_LINES = 20;
  const OVERLAP = 4;

  for (let i = 0; i < lines.length; i += CHUNK_LINES - OVERLAP) {
    const end = Math.min(i + CHUNK_LINES, lines.length);
    const chunkLines = lines.slice(i, end);
    const text = chunkLines.join("\n").trim();
    if (text.length < 50) continue;
    chunks.push({
      id: crypto.createHash("md5").update(`${filename}:${i}:${end}`).digest("hex").slice(0, 8),
      filename,
      lineStart: i + 1,
      lineEnd: end,
      text,
      metadata,
    });
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function buildIndex(): Promise<void> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const files = fs.readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".md"));
  const allChunks: Chunk[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(RECORDS_DIR, file), "utf-8");
    const chunks = chunkFile(file, content);
    allChunks.push(...(chunks as Chunk[]));
  }

  // Batch embed
  const texts = allChunks.map((c) => c.text);
  const batchSize = 100;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });
    for (let j = 0; j < batch.length; j++) {
      allChunks[i + j].embedding = response.data[j].embedding;
    }
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(allChunks, null, 2));
  console.log(`Indexed ${allChunks.length} chunks from ${files.length} files.`);
}

export async function search(query: string, topK: number = 5): Promise<Omit<Chunk, "embedding">[]> {
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error("Index not built. Run: npm run index");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const chunks: Chunk[] = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));

  const queryEmbedding = (
    await client.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    })
  ).data[0].embedding;

  const scored = chunks
    .filter((c) => c.embedding)
    .map((c) => ({
      ...c,
      score: cosineSimilarity(queryEmbedding, c.embedding!),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(({ embedding: _e, ...rest }) => rest);
}
