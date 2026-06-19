import { defineAgent } from "eve";
import { createAnthropic } from "@ai-sdk/anthropic";

// Use OpenRouter via Anthropic-compatible endpoint
const openrouter = createAnthropic({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY!,
});

export default defineAgent({
  model: openrouter("claude-haiku-4.5"),
});
