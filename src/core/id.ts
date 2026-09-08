/** Short, collision-resistant ids. Prefers crypto.randomUUID when available. */
export function newId(prefix: string): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.randomUUID) return `${prefix}_${g.crypto.randomUUID()}`;
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${rand}`;
}
