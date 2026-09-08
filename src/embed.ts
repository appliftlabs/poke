/**
 * Script-tag entry point. Boots Poke from a `<script src=".../poke.global.js">`
 * tag and reads configuration from the tag's data-* attributes.
 *
 * Not yet wired up — the anchoring engine lands first. For now this just exposes
 * the same API surface as the package entry on `window.Poke` so early adopters
 * can experiment.
 */
export * from "./anchor/index.js";
