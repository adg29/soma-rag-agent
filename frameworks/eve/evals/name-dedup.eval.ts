import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// Tests that the agent handles name collisions correctly (two Priya Nairs)

export default defineEval({
  description: "Agent correctly distinguishes between records involving people with the same name",
  async test(t) {
    await t.send("Who is Priya Nair?");
    t.completed();
    t.calledTool("search");
    // There are TWO Priya Nairs in the corpus - agent should clarify both
    t.check(
      t.reply,
      includes("Acme", "CTO"),
      "Must mention Priya Nair the CTO of Acme"
    );
    t.check(
      t.reply,
      includes("Nexus", "MD", "CEO", "physician", "doctor", "health"),
      "Must mention Dr. Priya Nair of Nexus Health"
    );
    t.check(
      t.reply,
      includes("two", "different", "same name", "both", "another"),
      "Must flag that these are two different people with the same name"
    );
  },
});
