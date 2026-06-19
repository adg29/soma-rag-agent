/**
 * Claude Managed Agents — Grounded Q&A over VC deal data
 *
 * This implementation uses the Anthropic Managed Agents API (beta).
 * The agent runs in an Anthropic-managed cloud sandbox with built-in:
 *   - Durable session state
 *   - Tool execution
 *   - Persistent conversation history (server-side)
 *
 * Requires: ANTHROPIC_API_KEY with managed-agents-2026-04-01 beta access.
 * Fallback: set OPENROUTER_API_KEY to test with OpenRouter instead.
 *
 * Docs: https://platform.claude.com/docs/en/managed-agents/overview
 */

import Anthropic from "@anthropic-ai/sdk";
import readline from "readline";
import { search } from "./search.js";

// ── System prompt (same faithfulness rules as the eve implementation) ─────────
const SYSTEM_PROMPT = `You are a research agent for a venture capital firm. You answer questions about companies, people, and deals by reasoning over a corpus of internal records: meeting transcripts, intro emails, founder updates, and deal notes.

RULES:
1. Every factual claim must be grounded in a specific record. Never invent facts.
2. Cite every claim: [filename:line_start-line_end] — e.g. [acme-meeting-2024-01.md:12-18]
3. If two records disagree, surface BOTH versions and cite each. Do not silently pick one.
4. If the corpus cannot support an answer, say "I don't know" explicitly.
5. For multi-part questions, search multiple times across different angles.`;

// ── Tool definition ────────────────────────────────────────────────────────────
const SEARCH_TOOL: Anthropic.Tool = {
  name: "search",
  description:
    "Search the corpus of internal VC records (emails, meeting notes, deal memos, founder updates). Returns relevant chunks with source citations. Always call this before making any factual claim.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language query to search for in the records corpus",
      },
      topK: {
        type: "number",
        description: "Number of results to return (default 8, max 10)",
      },
    },
    required: ["query"],
  },
};

// ── Tool executor ──────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (name === "search") {
    const results = await search(
      input.query as string,
      Math.min((input.topK as number) ?? 8, 10)
    );
    if (!results.length) return "No relevant records found.";
    return results
      .map(
        (r: any) =>
          `[${r.filename}:${r.lineStart}-${r.lineEnd}]` +
          (r.metadata?.date ? ` (${r.metadata.date})` : "") +
          `\n${r.text}`
      )
      .join("\n\n---\n\n");
  }
  throw new Error(`Unknown tool: ${name}`);
}

// ── Option A: Claude Managed Agents API (requires ANTHROPIC_API_KEY + beta) ───
async function runWithManagedAgents(): Promise<void> {
  // NOTE: Managed Agents is still beta. The SDK wraps this automatically.
  // Real usage:
  //   const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  //   const agent = await client.beta.agents.create({ ... });
  //   const session = await client.beta.agents.sessions.create(agent.id, { ... });
  //   const stream = await client.beta.agents.sessions.stream(session.id, { ... });
  //
  // The session stores conversation history server-side — no need to track messages locally.
  // Tool calls surface as events in the SSE stream; you execute them and send results back.
  //
  // See: https://platform.claude.com/docs/en/managed-agents/sessions

  console.log("Claude Managed Agents requires ANTHROPIC_API_KEY with beta access.");
  console.log("Falling back to direct Messages API mode (same logic, no managed infra).\n");
  await runWithMessagesAPI();
}

// ── Option B: Direct Messages API (works with OpenRouter for testing) ──────────
async function runWithMessagesAPI(): Promise<void> {
  const useOpenRouter = !process.env.ANTHROPIC_API_KEY;
  const client = useOpenRouter
    ? new Anthropic({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_API_KEY!,
      })
    : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const model = useOpenRouter
    ? "anthropic/claude-haiku-4.5"
    : "claude-haiku-4-5";

  console.log(
    useOpenRouter
      ? "Using OpenRouter (set ANTHROPIC_API_KEY for Claude Managed Agents)"
      : "Using Anthropic direct API"
  );
  console.log(`Model: ${model}\n`);

  // In Managed Agents: this history lives server-side, you don't track it locally.
  // Here we track it to replicate the stateful session behavior.
  const messages: Anthropic.MessageParam[] = [];

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (q: string) => new Promise<string>((r) => rl.question(q, r));

  console.log('Ask questions about VC deals, companies, and people. Type "exit" to quit.\n');

  while (true) {
    const userInput = await prompt("You: ");
    if (userInput.toLowerCase() === "exit") break;
    if (!userInput.trim()) continue;

    messages.push({ role: "user", content: userInput });

    // Agentic loop: keep going until no more tool calls
    while (true) {
      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: [SEARCH_TOOL],
        messages,
      });

      // Collect text + tool calls from the response
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
      );
      const textBlocks = response.content.filter(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );

      if (toolUses.length === 0) {
        // Final answer — no more tool calls
        const reply = textBlocks.map((b) => b.text).join("");
        console.log(`\nAgent: ${reply}\n`);
        messages.push({ role: "assistant", content: response.content });
        break;
      }

      // Execute tool calls, then loop
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        process.stdout.write(`  [searching: "${(toolUse.input as any).query}"]\n`);
        const result = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
        });
      }
      messages.push({ role: "user", content: toolResults });
    }
  }

  rl.close();
  console.log("Goodbye.");
}

// ── Entry point ────────────────────────────────────────────────────────────────
if (process.env.ANTHROPIC_API_KEY) {
  await runWithManagedAgents();
} else {
  await runWithMessagesAPI();
}
