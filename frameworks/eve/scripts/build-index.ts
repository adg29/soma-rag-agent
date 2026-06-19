import { buildIndex } from "../lib/index.js";

buildIndex()
  .then(() => {
    console.log("Index built successfully.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to build index:", err);
    process.exit(1);
  });
