# vc-rag-agent

A reference implementation for the work trial: a grounded Q&A agent over unstructured deal data, built with [eve](https://eve.dev) and [OpenRouter](https://openrouter.ai).

**The goal:** Answer natural-language questions about companies, people, and deals by reasoning over a corpus of unstructured records — and cite a source for every claim. The hard part is not retrieval, it's faithfulness.

## Architecture

```
vc-rag-agent/
  agent/
    agent.ts              # claude-haiku-4.5 via OpenRouter (swap any model)
    instructions.md       # grounding rules: cite chunks or say "I don't know"
    tools/
      search.ts           # embed query → cosine search → return top-k chunks
  lib/
    index.ts              # chunker + OpenRouter embeddings + cosine search
  data/
    records/              # 15 synthetic VC records — intentionally messy
    index.json            # built by `npm run index` (gitignored)
  evals/
    evals.config.ts
    citation-accuracy.eval.ts   # cited source actually contains the claim
    conflict-detection.eval.ts  # surfaces conflicting data across records
    i-dont-know.eval.ts         # refuses on unanswerable questions
    multi-hop.eval.ts           # joins data across multiple records
    name-dedup.eval.ts          # handles same-name collisions
  scripts/
    build-index.ts        # chunks all records, embeds, writes data/index.json
```

**Stack:**
- Agent framework: [eve](https://eve.dev) (durable execution, tool calls, evals)
- Model: `anthropic/claude-haiku-4.5` via OpenRouter (configurable)
- Embeddings: `openai/text-embedding-3-small` via OpenRouter
- Vector search: in-process cosine similarity over a flat JSON index

## Dataset design

The synthetic corpus in `data/records/` is built around the hard cases:

| Hard case | How it's represented |
|---|---|
| Same company, different name | "Acme AI" (intro email) → rebrands to "Acme Inc." (Q1 founder update) |
| Conflicting data | Seed round: intro email says $3.8M; meeting notes say founder corrected to $4M |
| Same name, different people | Two "Priya Nair"s — one CTO of Acme, one CEO of Nexus Health |
| Multi-hop questions | BrightLoop intro source (intro email) vs. investment recommendation (deal note) — two records |
| Unanswerable questions | Nexus Health: no meeting was held, no revenue figure was ever recorded |
| Market intel vs. confirmed data | Acme Series B rumor is single-source, unconfirmed |

15 records total: intro emails, meeting notes, deal memos, founder updates, a portfolio snapshot.

## Eval results

Running `npm run evals` against the reference implementation:

| Eval | Score | What it tests |
|---|---|---|
| citation-accuracy | 5/5 | Cited source actually contains the stated fact |
| conflict-detection | 5/5 | Surfaces $3.8M vs $4M seed round conflict |
| multi-hop | 5/5 | Joins intro email + deal note across two records |
| i-dont-know | 3/3 | Refuses to invent Nexus Health ARR |
| name-dedup | 5/5 | Distinguishes two people named Priya Nair |
| **Total** | **23/23** | |

## Setup

### Prerequisites

- Node.js >= 24
- [OpenRouter](https://openrouter.ai) API key (handles both embeddings and LLM calls — one key)

### Install & run

```bash
npm install

# Add your OpenRouter key
echo "OPENROUTER_API_KEY=sk-or-..." > .env.local

# Build the search index (chunks + embeds all records)
npm run index

# Start the agent
npm run dev
```

### Run evals

```bash
npx eve eval
```

## Example questions

**These should answer well:**
- "What is the latest on Acme?" — multi-record, rebrand, Series B rumor
- "Who introduced us to BrightLoop and what was the investment rationale?" — multi-hop
- "How much did Acme raise in their seed round?" — conflict detection
- "Who is Priya Nair?" — name disambiguation
- "What's BrightLoop's current ARR?" — multi-record, most recent update

**These should return "I don't know":**
- "What is Nexus Health's ARR?" — never recorded
- "Has DeepForm found a co-founder?" — no follow-up record exists
- "What did Vault Protocol's last update say?" — not in corpus

## Evaluation rubric

What matters when evaluating a submission:

| Dimension | What to look at |
|---|---|
| Citation accuracy | Does the cited source actually contain the stated fact? |
| Refusal behavior | Does it say "I don't know" on genuinely unanswerable questions? |
| Conflict detection | Does it surface the $3.8M vs $4M discrepancy without picking one silently? |
| Multi-hop joins | Can it connect the intro source to the investment decision? |
| Name disambiguation | Does it handle the two Priya Nairs? |
| Dataset design | Did the candidate build their own messy corpus? What assumptions did they make? |
| Code quality | Is the retrieval + citation layer something you'd build on? |
