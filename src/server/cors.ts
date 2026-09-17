/**
 * CORS origin matching for `origins` config.
 *
 * Each comma-separated (or array) entry is one of:
 *   *                        any origin (trusted / internal use only)
 *   https://app.example.com  an exact origin
 *   https://*.example.com    any single-label subdomain, scheme must match
 */
type OriginRule = { any: true } | { exact: string } | { rx: RegExp };

export function buildOriginRules(spec: string | string[] | undefined): OriginRule[] {
  const patterns = Array.isArray(spec)
    ? spec
    : (spec ?? "*").split(",").map((s) => s.trim());

  return patterns.filter(Boolean).map((pattern): OriginRule => {
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
export function matchOrigin(rules: OriginRule[], origin: string | null): string {
  if (!origin) return "";
  for (const rule of rules) {
    if ("any" in rule) return "*";
    if ("exact" in rule && rule.exact === origin) return origin;
    if ("rx" in rule && rule.rx.test(origin)) return origin;
  }
  return "";
}
