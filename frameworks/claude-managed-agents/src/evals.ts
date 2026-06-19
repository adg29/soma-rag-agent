/**
 * Eval runner for Claude Managed Agents implementation.
 * Same 5 checks as the eve implementation — same questions, same scoring.
 * Runs via direct Messages API (or Managed Agents if ANTHROPIC_API_KEY is set).
 */
import Anthropic from "@anthropic-ai/sdk";
import { search } from "./search.js";

const OR_KEY = process.env.OPENROUTER_API_KEY!;

async function ask(question: string): Promise<string> {
  const results = await search(question, 10);
  const context = results
    .map((r: any) => `[${r.filename}:${r.lineStart}-${r.lineEnd}]\n${r.text}`)
    .join("\n\n---\n\n");

  const client = new Anthropic({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: OR_KEY,
  });

  const response = await client.messages.create({
    model: "anthropic/claude-haiku-4.5",
    max_tokens: 800,
    system: `You are a research agent for a venture capital firm. Answer questions using ONLY the provided source records. Cite every factual claim with [filename:line_start-line_end]. If records conflict, surface BOTH versions and cite each. If the corpus cannot support an answer, say "I don't know" explicitly.`,
    messages: [
      {
        role: "user",
        content: `SOURCE RECORDS:\n${context}\n\nQUESTION: ${question}`,
      },
    ],
  });

  return (response.content[0] as Anthropic.TextBlock).text;
}

const evals = [
  {
    name: "citation-accuracy",
    question: "Who are the founders of BrightLoop and what are their backgrounds?",
    checks: [
      { desc: "cites brightloop-meeting file", fn: (r: string) => /brightloop-meeting/.test(r) },
      { desc: "mentions Marcus Webb", fn: (r: string) => /Marcus/i.test(r) },
      { desc: "mentions Lena Park", fn: (r: string) => /Lena/i.test(r) },
      { desc: "cites Stripe background (Marcus)", fn: (r: string) => /Stripe/i.test(r) },
      { desc: "cites Temporal background (Lena)", fn: (r: string) => /Temporal/i.test(r) },
    ],
  },
  {
    name: "conflict-detection",
    question: "How much did Acme raise in their seed round?",
    checks: [
      { desc: "mentions $3.8M (intro email)", fn: (r: string) => /3\.8/.test(r) },
      { desc: "mentions $4M (founder correction)", fn: (r: string) => /\$4M|\b4M\b|final close was \$4|raised \$4/i.test(r) },
      { desc: "flags the discrepancy", fn: (r: string) => /discrepan|conflict|disagree|differ|corrected|however|one.*record|intro.*email/i.test(r) },
      { desc: "cites acme-intro-email", fn: (r: string) => /acme-intro-email/.test(r) },
      { desc: "cites acme-meeting", fn: (r: string) => /acme-meeting/.test(r) },
    ],
  },
  {
    name: "multi-hop",
    question: "Who introduced us to BrightLoop and who led the investment recommendation?",
    checks: [
      { desc: "identifies Nikhita as intro source", fn: (r: string) => /Nikhita/i.test(r) },
      { desc: "identifies Mir as deal recommender", fn: (r: string) => /Mir/i.test(r) },
      { desc: "cites brightloop-intro-email", fn: (r: string) => /brightloop-intro-email/.test(r) },
      { desc: "cites brightloop-deal-note", fn: (r: string) => /brightloop-deal-note/.test(r) },
      { desc: "draws from 2+ files", fn: (r: string) => (r.match(/\[brightloop-[^\]]+\]/g) || []).length >= 2 },
    ],
  },
  {
    name: "i-dont-know",
    question: "What is Nexus Health's current ARR?",
    checks: [
      { desc: "declines to answer / no data", fn: (r: string) => /don.t know|do not know|no.*ARR|not.*record|cannot find|no information|not.*provided|no data/i.test(r) },
      { desc: "does NOT fabricate an ARR figure", fn: (r: string) => !/current ARR.*\$\d|\$\d.*current ARR|ARR is \$|ARR of \$/i.test(r) },
      { desc: "cites a nexus-health source", fn: (r: string) => /nexus-health/.test(r) },
    ],
  },
  {
    name: "name-dedup",
    question: "Who is Priya Nair?",
    checks: [
      { desc: "mentions Acme CTO Priya", fn: (r: string) => /Acme/i.test(r) && /CTO/i.test(r) },
      { desc: "mentions Nexus Health Priya", fn: (r: string) => /Nexus/i.test(r) },
      { desc: "flags name collision / two people", fn: (r: string) => /two|different|same name|both|another|multiple|distinguish/i.test(r) },
      { desc: "cites an acme record", fn: (r: string) => /acme/.test(r) },
      { desc: "cites a nexus record", fn: (r: string) => /nexus/.test(r) },
    ],
  },
];

async function main() {
  let totalPassed = 0, totalChecks = 0;
  for (let i = 0; i < evals.length; i++) {
    const ev = evals[i];
    if (i > 0) await new Promise((r) => setTimeout(r, 1000));
    console.log(`\n${"=".repeat(60)}\nEVAL ${i + 1}/5: ${ev.name}\nQ: ${ev.question}\n${"=".repeat(60)}`);
    let reply = "";
    try {
      reply = await ask(ev.question);
      console.log(`\nAGENT REPLY:\n${reply}\n`);
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
      totalChecks += ev.checks.length;
      for (const c of ev.checks) console.log(`  ✗ ${c.desc}`);
      continue;
    }
    let passed = 0;
    for (const check of ev.checks) {
      const ok = check.fn(reply);
      console.log(`  ${ok ? "✓" : "✗"} ${check.desc}`);
      if (ok) passed++;
    }
    console.log(`\n  Result: ${passed}/${ev.checks.length}`);
    totalPassed += passed;
    totalChecks += ev.checks.length;
  }
  console.log(`\n${"=".repeat(60)}\nFINAL SCORE: ${totalPassed}/${totalChecks}\n${"=".repeat(60)}`);
}

main().catch(console.error);
