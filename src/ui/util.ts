import type { PokeUser } from "../core/types.js";

/** "2 minutes ago", "3 hours ago", "12 Mar" — compact relative-ish time. */
export function relTime(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 90) return "a minute ago";
  const m = Math.round(s / 60);
  if (m < 45) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Deterministic colour from a user id, so avatars are stable without config. */
export function userColor(user: PokeUser): string {
  if (user.color) return user.color;
  let hash = 0;
  for (let i = 0; i < user.id.length; i++) {
    hash = (hash << 5) - hash + user.id.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 55% 55%)`;
}

/** Keep a floating card fully within the viewport. */
export function clampToViewport(
  x: number,
  y: number,
  w: number,
  h: number,
  pad = 12,
): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    left: Math.max(pad, Math.min(x, vw - w - pad)),
    top: Math.max(pad, Math.min(y, vh - h - pad)),
  };
}
