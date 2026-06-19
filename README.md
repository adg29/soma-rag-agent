# soma-rag-agent

A reference implementation for the Soma Capital work trial: a grounded Q&A agent over unstructured VC deal data, built with [eve](https://eve.dev).

## What this demonstrates

- **Faithfulness-first RAG**: every factual claim is cited to a specific chunk (`[filename.md:line-line]`)
- **"I don't know" path**: agent refuses to answer when the corpus doesn't support it
- **Conflict detection**: surfaces disagreements between records (e.g. seed round amount in intro email vs. meeting notes)
- **Multi-hop reasoning**: answers questions that require joining across multiple documents
- **Name disambiguation**: handles same-name collisions in the corpus
- **Scored evals**: CI-ready test suite that scores citation accuracy, refusal behavior, multi-hop joins, and conflict detection

## Architecture

```
soma-rag-agent/
  agent/
    agent.ts              # claude-sonnet-4.6, inherits eve durable session
    instructions.md       # grounding rules: cite chunks or say "I don't know"
    tools/
      search.ts           # embed query → cosine search → return top-k chunks
    channels/
      eve.ts              # default HTTP channel
  lib/
    index.ts              # chunker + embedder + cosine search (OpenAI embeddings)
  data/
    records/              # 12 synthetic VC records (intentionally messy)
      acme-intro-email.md           # Acme AI intro — mismatched seed round ($3.8M)
      acme-meeting-2024-01.md       # Acme meeting — corrects seed to $4M
      acme-inc-founder-update-q1.md # Same company, rebranded to "Acme Inc."
      acme-deal-note.md             # Pass on Series A
      acme-series-b-rumor.md        # Market intel, back in market
      brightloop-intro-email.md     # BrightLoop intro via Nikhita
      brightloop-meeting-2024-02.md # First in-person meeting
      brightloop-deal-note.md       # Seed investment recommendation (Mir)
      brightloop-founder-update-q2.md  # Q2 update, strong growth
      brightloop-series-a-note.md   # Series A follow-on discussion
      nexus-health-intro-email.md   # Healthcare pass — different "Priya Nair"
      nexus-health-no-meeting.md    # Pass note
      deepform-intro-email.md       # Pre-revenue pass
      deepform-meeting-2024-05.md   # Pre-revenue meeting notes
      soma-portfolio-snapshot-q2.md # Portfolio overview
    index.json            # built by `npm run index` (gitignored)
  evals/
    citation-accuracy.eval.ts  # cited source actually contains the claimed fact
    i-dont-know.eval.ts        # refuses on unanswerable questions
    multi-hop.eval.ts          # joins intro email + deal note
    conflict-detection.eval.ts # surfaces $3.8M vs $4M seed round conflict
    name-dedup.eval.ts         # two Priya Nairs in the corpus
  scripts/
    build-index.ts        # chunks all records, embeds them, writes index.json
```

## Dataset design notes

The synthetic corpus is intentionally messy to exercise the hard cases:

- **Same company, different name**: "Acme AI" → rebranded to "Acme Inc." in March 2024
- **Conflicting data**: intro email says $3.8M seed; meeting notes say $4M (founder corrected on call)
- **Same name, different people**: Two "Priya Nair"s — one is CTO of Acme, one is CEO of Nexus Health
- **Multi-source questions**: BrightLoop intro source (Nikhita, intro email) vs. deal recommendation (Mir, deal note)
- **Unanswerable questions**: Nexus Health never had a meeting or revenue figure recorded
- **Market intel vs. confirmed data**: Acme Series B info is one-source rumor, not confirmed

## Setup

### Prerequisites

- Node.js >= 24
- OpenAI API key (for embeddings)
- Anthropic API key (for the agent)

### Install

```bash
npm install
```

### Configure environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### Build the search index

```bash
npm run index
```

This chunks all records in `data/records/`, embeds them using `text-embedding-3-small`, and writes `data/index.json`.

### Run the agent

```bash
npm run dev
```

The agent starts on `http://localhost:3000`. Use `eve dev` for the interactive TUI.

### Run evals

```bash
npx eve eval
```

## Example questions

Questions the agent handles well:

- "What is the latest on Acme?" (multi-record, rebrand, Series B rumor)
- "Who introduced us to BrightLoop and what was the investment rationale?" (multi-hop: intro email + deal note)
- "How much did Acme raise in their seed round?" (conflict detection: $3.8M vs $4M)
- "Who is Priya Nair?" (disambiguation: two people with the same name)
- "What's BrightLoop's current ARR?" (multi-record, most recent update wins)

Questions that should return "I don't know":

- "What is Nexus Health's ARR?" (never recorded)
- "Has DeepForm found a co-founder?" (no follow-up record after the meeting)
- "What did Vault Protocol's last founder update say?" (no update in corpus)

## Evaluation rubric (for candidates)

| Dimension | What we look at |
|---|---|
| Citation accuracy | Does the cited source actually contain the stated fact? |
| Refusal behavior | Does it say "I don't know" on unanswerable questions? |
| Conflict detection | Does it surface the $3.8M vs $4M discrepancy? |
| Multi-hop joins | Can it connect intro source to investment decision? |
| Name disambiguation | Does it handle the two Priya Nairs? |
| Dataset design | Did the candidate build their own messy corpus? |
| Code quality | Is the retrieval + citation layer something you'd build on? |
