/**
 * One-shot Q&A script — same eval questions as the eve implementation.
 * Usage: npx tsx src/ask.ts "Who are the founders of BrightLoop?"
 */
import Anthropic from "@anthropic-ai/sdk";
import { search } from "./search.js";

const SYSTEM = `You are a research agent for a venture capital firm. Answer questions using ONLY the provided source records. Cite every factual claim with [filename:line_start-line_end]. If records conflict, surface BOTH versions and cite each. If the corpus cannot support an answer, say "I don't know" explicitly.`;

async function ask(question: string): Promise<string> {
  const results = await search(question, 10);
  const context = results
    .map((r: any) => `[${r.filename}:${r.lineStart}-${r.lineEnd}]\n${r.text}`)
    .join("\n\n---\n\n");

  const client = new Anthropic({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });

  const response = await client.messages.create({
    model: "anthropic/claude-haiku-4.5",
    max_tokens: 800,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `SOURCE RECORDS:\n${context}\n\nQUESTION: ${question}`,
      },
    ],
  });

  return (response.content[0] as Anthropic.TextBlock).text;
}

const question = process.argv.slice(2).join(" ");
if (!question) {
  console.error("Usage: npx tsx src/ask.ts <question>");
  process.exit(1);
}

const answer = await ask(question);
console.log(answer);
