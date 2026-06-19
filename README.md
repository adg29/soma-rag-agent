# vc-rag-agent

A reference implementation for the work trial: a grounded Q&A agent over unstructured VC deal data.

**The goal:** Answer natural-language questions about companies, people, and deals by reasoning over a corpus of unstructured records — and cite a source for every claim. The hard part is not retrieval, it's faithfulness.

## Two implementations, one dataset

The `data/` directory contains a shared dataset of 15 synthetic VC records. Two agent implementations run against it, using different frameworks:

| | `frameworks/eve/` | `frameworks/claude-managed-agents/` |
|---|---|---|
| Framework | [Vercel eve](https://eve.dev) | [Anthropic Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) (beta) |
| Model | Any (via OpenRouter) | Claude only |
| Session state | Durable workflow (Vercel) | Server-side (Anthropic) |
| Channels | Built-in (Slack, Discord, etc.) | DIY |
| Evals | Built-in (`eve eval`) | DIY |
| Infra | Vercel or local | Anthropic-managed sandbox |
| Runtime req. | Node.js >= 24 | Node.js >= 18 |

Both implementations use the same retrieval layer (OpenRouter embeddings + cosine search) and the same faithfulness-first system prompt. The difference is in how the agent loop, session state, and tool execution are handled.

## Dataset

15 synthetic records in `data/records/` — intentionally messy:

| Hard case | How it's in the corpus |
|---|---|
| Same company, different name | "Acme AI" → rebrands to "Acme Inc." mid-stream |
| Conflicting data | Seed round: $3.8M (intro email) vs $4M (corrected on call) |
| Same name, different people | Two "Priya Nair"s — CTO of Acme, CEO of Nexus Health |
| Multi-hop joins | BrightLoop intro source (intro email) + deal recommendation (deal note) |
| Unanswerable questions | Nexus Health: no meeting, no revenue figure recorded |

## Eval results (both implementations, 23/23)

| Eval | Tests |
|---|---|
| citation-accuracy | Cited source actually contains the stated fact |
| conflict-detection | Surfaces $3.8M vs $4M seed discrepancy |
| multi-hop | Joins intro email + deal note across two records |
| i-dont-know | Refuses to invent Nexus Health ARR |
| name-dedup | Distinguishes two people named Priya Nair |

## Quick start

```bash
# 1. Build the shared search index (run once)
cd data && npm install && npm run index

# 2. Run the eve implementation
cd ../frameworks/eve && npm install && npm run dev

# 3. Or run the Managed Agents implementation  
cd ../frameworks/claude-managed-agents && npm install && npm start
```

Both implementations require `OPENROUTER_API_KEY`. The Managed Agents implementation also accepts `ANTHROPIC_API_KEY` for production use with the real Managed Agents API.

## Repo structure

```
vc-rag-agent/
  data/
    records/          # 15 synthetic VC records (shared)
    index.json        # built by indexing script (gitignored)
  frameworks/
    eve/              # Vercel eve implementation
    claude-managed-agents/  # Anthropic Managed Agents implementation
```
