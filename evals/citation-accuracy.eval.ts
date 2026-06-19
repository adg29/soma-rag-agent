import { defineEval } from "eve/evals";
import { includes, matches } from "eve/evals/expect";

// Tests that the agent cites real sources, not invented ones

export default defineEval({
  description: "Agent cites sources that actually exist and contain the claimed facts",
  async test(t) {
    await t.send("Who are the founders of BrightLoop and what are their backgrounds?");
    t.completed();
    t.calledTool("search");
    // Must cite a real source file
    t.check(
      t.reply,
      matches(/\[brightloop-meeting-2024-02\.md:\d+-\d+\]/),
      "Must cite the BrightLoop meeting notes"
    );
    // Must mention both founders
    t.check(t.reply, includes("Marcus"), "Must mention Marcus Webb");
    t.check(t.reply, includes("Lena"), "Must mention Lena Park");
  },
});
