import { defineConfig } from "vitest/config";

// https://vitejs.dev/config/
export default defineConfig({
  root: "./src",
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.playwright.test.ts"],
  },
  build: {
    target: "esnext",
  },
});
