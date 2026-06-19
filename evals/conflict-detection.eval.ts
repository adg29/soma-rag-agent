import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// Tests that the agent surfaces conflicting data rather than silently picking one

export default defineEval({
  description: "Agent surfaces conflicts between records rather than silently resolving them",
  async test(t) {
    await t.send("How much did Acme raise in their seed round?");
    t.completed();
    t.calledTool("search");
    // Records disagree: intro email says $3.8M, meeting notes say $4M
    // Agent should surface the conflict, not pick one
    t.check(t.reply, includes("3.8", "$3.8"), "Must mention the $3.8M figure from intro email");
    t.check(t.reply, includes("4", "$4"), "Must mention the $4M figure from meeting notes");
    t.check(
      t.reply,
      includes("discrepan", "conflict", "disagree", "differ", "one record", "another record"),
      "Must call out the conflict explicitly"
    );
  },
});
