import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    exclude: ["packages/*/test/**/*.db.test.ts"],
  },
});
