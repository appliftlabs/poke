import { defineConfig } from "tsup";

const esbuildJsx = {
  jsx: "automatic" as const,
  jsxImportSource: "preact",
};

export default defineConfig([
  // Library build: ESM + CJS for `import` / `require`.
  //
  // Preact is bundled in (not left as a peer dependency) so that
  // `import { init } from "@appliftlabs/poke"` works with nothing else installed —
  // Poke's whole point is being drop-in. Poke renders into a Shadow DOM with
  // its own Preact instance, so this copy never interacts with a host app's
  // Preact or React; the ~12KB is the cost of zero-config.
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    noExternal: [/^preact/],
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
