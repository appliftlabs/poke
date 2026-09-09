/**
 * CORS origin matching for POKE_ORIGINS.
 *
 * Each comma-separated entry is one of:
 *   *                        any origin (trusted / internal use only)
 *   https://app.example.com  an exact origin
 *   https://*.example.com    any single-label subdomain, scheme must match
 */
export function buildOriginRules(spec) {
  return (spec || "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pattern) => {
      if (pattern === "*") return { any: true };
      if (pattern.includes("*")) {
        const rx = new RegExp(
          "^" +
            pattern
              .split("*")
              .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
              .join("[^.]+") +
            "$",
        );
        return { rx };
      }
      return { exact: pattern };
    });
}

/** Returns the value to send as Access-Control-Allow-Origin, or "" to deny. */
export function matchOrigin(rules, origin) {
  if (!origin) return "";
  for (const rule of rules) {
    if (rule.any) return "*";
    if (rule.exact && rule.exact === origin) return origin;
    if (rule.rx && rule.rx.test(origin)) return origin;
  }
  return "";
}
