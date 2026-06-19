import { defineEval } from "eve/evals";
import { includes, matches } from "eve/evals/expect";

// Tests that the agent can join across multiple records

export default defineEval({
  description: "Agent can answer questions requiring data from multiple records",
  async test(t) {
    await t.send("Who introduced us to BrightLoop and who led the investment decision?");
    t.completed();
    t.calledTool("search");
    // Intro came from Nikhita (intro email) - needs intro email record
    t.check(t.reply, includes("Nikhita"), "Must find intro source (Nikhita) from intro email");
    // Investment was led/recommended by Mir (deal note)
    t.check(t.reply, includes("Mir"), "Must find deal recommendation from Mir");
    // Must cite both records
    t.check(
      t.reply,
      matches(/\[brightloop-intro-email\.md:\d+-\d+\]/),
      "Must cite the intro email"
    );
    t.check(
      t.reply,
      matches(/\[brightloop-deal-note\.md:\d+-\d+\]/),
      "Must cite the deal note"
    );
  },
});
