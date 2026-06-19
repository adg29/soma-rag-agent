# Context & Guiding Thoughts

*For candidates who want to understand where this problem fits in production.*

---

## What this exercise is actually about

The hard part of building a Q&A agent over unstructured records is not retrieval. Vector search is a solved problem. The hard part is **faithfulness**: making sure every claim the agent makes can be traced back to a specific source, and that the agent says "I don't know" when the data doesn't support an answer.

An answer you can't verify is worse than no answer — because someone is going to act on it.

This is the core of what we're evaluating: not whether you can build an agent that sounds confident, but whether you can build one you'd trust.

---

## Three architectures, one problem

As you think about data sourcing, most production implementations land in one of three patterns:

**Option A: Pull + embed (local index)**
Sync records on a schedule → chunk + embed → run search against a local vector index. Freshness = sync frequency. This is what our internal LP relationship search looks like in production: Attio → delta sync every 15 min → vector index → semantic search. It's also the simplest option to build and the one most candidates will reach for.

**Option B: External API-backed retrieval**
Records live behind an API (Attio, Notion, Google Drive). Either you maintain a vector store that shadows the API (near-realtime, one extra hop), or you query the API at search time. Auth happens at sync or query time. The agent doesn't care — it gets chunks with citations either way.

**Option C: Hybrid (private corpus + public sources)**
Two search tools: one hitting your private records, one hitting public sources (SEC EDGAR, Crunchbase, web search). The interesting engineering problem is when private and public data *disagree* on a fact. A Crunchbase entry might say a company raised $4M; your meeting notes say the founder corrected it to $3.8M on the call. The agent must surface that conflict — not silently pick one.

The dataset we've built deliberately exercises Option A hard cases. But if you want to go further, Option C is where the most interesting faithfulness problems live.

---

## Citation is the whole game

In the DRACO benchmark (Perplexity's open-source deep research eval), citation quality is scored alongside factual accuracy as a first-class dimension. Their finding: the hard problems in research agents are not formatting — they're getting the facts right and attributing them correctly.

For a private records agent, the citation bar is:
- Every factual claim cites a specific chunk: `[filename:line_start-line_end]`
- When two records conflict, both are cited and the conflict is flagged
- When neither record supports an answer, the agent says so explicitly

The dataset in `data/records/` is built around these failure modes:
- Same company under two names ("Acme AI" → rebrands to "Acme Inc.")
- Conflicting funding figures across two records ($3.8M vs $4M — both get cited)
- Two people named Priya Nair (different companies, different roles)
- Questions the data simply cannot answer (Nexus Health ARR — never recorded)

A candidate who treats the dataset as a clean lookup problem missed the point. The mess is the exercise.

---

## How the eval suite works

The five scored evals test the dimensions that matter most:

| Eval | What it actually tests |
|---|---|
| `citation-accuracy` | Does the cited chunk actually contain the stated fact? |
| `conflict-detection` | Does the agent surface both versions of a conflicting fact? |
| `multi-hop` | Can it join the intro source from one record with the deal recommendation from another? |
| `i-dont-know` | Does it refuse to invent an ARR figure that isn't in the corpus? |
| `name-dedup` | Does it distinguish two people with the same name rather than merging them? |

The evals are programmatic (regex + structure checks), not LLM-as-judge. That's intentional: the answers are deterministic enough to verify mechanically, and it removes subjectivity from the scoring.

---

## On benchmarks

**DRACO** (Perplexity, open-source)  
Best reference for: web research agents that source from public data. 100 tasks across 10 domains with expert-written rubrics averaging ~40 criteria each. Finance and Academic categories are most relevant for VC use cases. Available at `hf.co/datasets/perplexity-ai/draco`.

**RAGAS** (explodinggradients/ragas)  
Best reference for: private RAG systems evaluated against your own data. Four metrics: faithfulness, answer relevance, context precision, context recall. The right eval framework for measuring retrieval quality against internal records (Attio, emails, deal memos).

**Custom domain rubric (DRACO-style)**  
Most signal, most work. If you get to the debrief and want to go deeper: propose a rubric structure for evaluating LP relationship lookup queries against a live CRM. What are the factual accuracy criteria? What's the negative weight for hallucinating a contact that doesn't exist? What does "context precision" mean when the source is a CRM record?

---

## Framework notes

We built reference implementations in three frameworks. The choice of framework is not what we're evaluating — what matters is the faithfulness layer, the dataset design, and the eval coverage.

**Vercel eve** (`frameworks/eve/`): durable execution, built-in eval runner (`eve eval`), Slack channel in one command. Good for agents that need long-running sessions, multi-channel deployment, or scheduled runs. Requires Node.js ≥ 24 and a Vercel project for full feature access.

**Claude Managed Agents** (`frameworks/claude-managed-agents/`): Anthropic-managed sandbox, session history stored server-side, no deploy step. Claude-only. Better fit for ad-hoc research tasks where you want Anthropic to handle the infrastructure entirely.

**Hybrid** (`frameworks/hybrid/`): two search tools — private corpus and public sources (SEC EDGAR + web). The citation format distinguishes `[private:filename:lines]` from `[public:source:url]`. Useful when the interesting question is what your internal records say *versus* what's publicly verifiable.

All three share the same dataset (`data/records/`) and the same faithfulness standard.

---

## The production parallel

If you're curious what this looks like at scale: we run a semantic search index over ~13,000 LP organization records, synced from our CRM every 15 minutes. The architecture is Option A — delta sync to a local vector index, cosine search at query time. 

The gap we're actively working on is exactly what this exercise tests: citation quality. When the search returns "Greenfield Endowment — 3 contacts," can a downstream agent say *which* contact, from *which* record, last updated *when*? Right now it can retrieve. The faithfulness layer is what we're building next.

That's why this exercise exists, and why the dataset is designed the way it is.
