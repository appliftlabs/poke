import { defineConfig } from "tsup";

const esbuildJsx = {
  jsx: "automatic" as const,
  jsxImportSource: "preact",
};

export default defineConfig([
  // Library build: ESM + CJS for `import` / `require`
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    esbuildOptions(o) {
      Object.assign(o, esbuildJsx);
    },
  },
  // Script-tag build: single self-executing bundle that boots Poke
  // from a <script src> tag and reads config off the tag's data-* attrs.
  // Preact is bundled in so the tag is truly drop-in.
  {
    entry: { poke: "src/embed.ts" },
    format: ["iife"],
    globalName: "Poke",
    sourcemap: true,
    minify: true,
    noExternal: [/.*/],
    outExtension: () => ({ js: ".global.js" }),
    esbuildOptions(o) {
      Object.assign(o, esbuildJsx);
    },
  },
]);
