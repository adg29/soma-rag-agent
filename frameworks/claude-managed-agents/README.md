# Claude Managed Agents — Grounded Q&A Agent

This implementation uses Anthropic's [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) API (beta) to run the same grounded Q&A agent as the eve implementation, but with Anthropic-managed infrastructure instead of Vercel.

## How it works

```
Your app
   │
   ├── POST /v1/agents          → create an agent (model + system prompt + tools)
   ├── POST /v1/agents/:id/sessions → start a session
   └── GET  /v1/sessions/:id/stream → SSE stream of events
                                        │
                            Anthropic-managed sandbox
                                  Claude runs here
                                  Tool calls route back to your server
                                  Session history stored server-side
```

The key difference from a DIY agent loop: **session state is server-side**. You don't track `messages[]` locally. The Managed Agents runtime handles:
- Conversation history persistence
- Tool call routing and retries
- Durable execution across pauses and interruptions
- Prompt caching and compaction

## Files

```
frameworks/claude-managed-agents/
  src/
    agent.ts      # Interactive Q&A session (Managed Agents or Messages API fallback)
    ask.ts        # One-shot Q&A (for scripting and evals)
    evals.ts      # Same 5 eval checks as the eve implementation
    search.ts     # Shared retrieval layer (OpenRouter embeddings + cosine search)
  package.json
  README.md
```

## Managed Agents vs eve — Q&A agent tradeoffs

| | Managed Agents | eve |
|---|---|---|
| Model lock | Claude only | Any model (OpenRouter, Gemini, etc.) |
| Session state | Server-side (Anthropic) | Durable workflow (Vercel) |
| Infra to manage | None | Vercel project |
| Channels (Slack etc.) | DIY | Built-in (`eve channels add slack`) |
| Eval framework | DIY | Built-in (`eve eval`) |
| Sandbox | Anthropic cloud | Vercel Sandbox or Docker |
| Multi-turn | Built-in, persistent | Built-in, durable |
| Beta status | Beta (April 2026) | GA |

**For this use case (grounded RAG):** Both work equally well. The retrieval + citation layer is the same. Managed Agents wins on simplicity (no deploy step); eve wins on ecosystem (channels, evals, any model).

## Setup

### Prerequisites

- Node.js >= 18
- `OPENROUTER_API_KEY` for embeddings and LLM (testing mode)
- `ANTHROPIC_API_KEY` with `managed-agents-2026-04-01` beta access (production mode)

### Install

```bash
npm install
```

### Ensure the shared index is built

```bash
# From repo root:
npm run index

# Or from here:
npm run index
```

### Run interactive Q&A

```bash
# With OpenRouter (testing, no Anthropic key needed):
OPENROUTER_API_KEY=sk-or-... npx tsx src/agent.ts

# With Anthropic Managed Agents (production):
ANTHROPIC_API_KEY=sk-ant-... OPENROUTER_API_KEY=sk-or-... npx tsx src/agent.ts
```

### One-shot query

```bash
OPENROUTER_API_KEY=sk-or-... npx tsx src/ask.ts "Who introduced us to BrightLoop?"
```

### Run evals

```bash
OPENROUTER_API_KEY=sk-or-... npx tsx src/evals.ts
```

## Connecting to the real Managed Agents API

When you have a beta API key, the full flow in `agent.ts` looks like:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 1. Create the agent (once — reuse by ID across sessions)
const agent = await client.beta.agents.create({
  model: "claude-haiku-4-5",
  name: "vc-rag-agent",
  instructions: SYSTEM_PROMPT,
  tools: [SEARCH_TOOL],
});

// 2. Start a session
const session = await client.beta.agents.sessions.create(agent.id);

// 3. Stream events
const stream = await client.beta.agents.sessions.stream(session.id, {
  input: [{ role: "user", content: "Who introduced us to BrightLoop?" }],
});

for await (const event of stream) {
  if (event.type === "tool_use") {
    // Execute tool and send result back
    const result = await executeTool(event.name, event.input);
    await client.beta.agents.sessions.submitToolResult(session.id, {
      tool_use_id: event.id, content: result
    });
  }
  if (event.type === "message" && event.role === "assistant") {
    console.log(event.content);
  }
}
```

The SDK beta header (`managed-agents-2026-04-01`) is injected automatically.
