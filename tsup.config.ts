import { defineConfig } from "tsup";

export default defineConfig([
  // Library build: ESM + CJS for `import` / `require`
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
  },
  // Script-tag build: single self-executing bundle that boots Poke
  // from a <script src> tag and reads config off the tag's data-* attrs.
  {
    entry: { poke: "src/embed.ts" },
    format: ["iife"],
    globalName: "Poke",
    sourcemap: true,
    minify: true,
    outExtension: () => ({ js: ".global.js" }),
  },
]);
