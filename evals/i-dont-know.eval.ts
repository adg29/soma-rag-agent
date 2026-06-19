import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// Tests that the agent refuses to answer when data is absent

export default defineEval({
  description: "Agent says 'I don't know' when the corpus has no relevant information",
  async test(t) {
    await t.send("What is the current ARR of Nexus Health?");
    t.completed();
    t.calledTool("search");
    // Should NOT invent a number - should say it doesn't know
    t.check(
      t.reply,
      includes("don't know", "do not know", "no information", "not available", "cannot find"),
      "Must acknowledge missing data rather than invent an ARR for Nexus Health"
    );
  },
});
