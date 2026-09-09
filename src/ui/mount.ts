/**
 * Creates an isolated Shadow-DOM host on the page and renders Poke's UI into it.
 * Everything Poke draws lives inside this shadow root, so the host page's CSS
 * cannot affect it and its CSS cannot affect the host page.
 */
import { h, render } from "preact";
import type { LocalIdentity } from "../core/identity.js";
import type { CommentStore } from "../core/store.js";
import { Overlay } from "./components/Overlay.js";
import { CSS } from "./styles.js";

const HOST_ID = "poke-overlay-host";

export interface MountHandle {
  unmount(): void;
  host: HTMLElement;
}

export interface MountOptions {
  /** Browser-local identity, if Poke is managing one (see poke.ts). */
  identity?: LocalIdentity | null;
  /** Route to another page when a cross-page comment is selected. */
  onNavigate?: (pageId: string) => void;
}

export function mountUI(store: CommentStore, options: MountOptions = {}): MountHandle {
  // Reuse an existing host if Poke was mounted before (HMR, double-init).
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host) host.remove();

  host = document.createElement("div");
  host.id = HOST_ID;
  // The host takes no space and never intercepts pointer events; the overlay
  // inside re-enables pointer events on just its interactive bits.
  //
  // The z-index goes on the HOST, not the inner .poke-root — the host is what
  // participates in the page's stacking context. Max int32 so nothing on the
  // host page can legitimately sit above it. `!important` in case the host page
  // has an aggressive `div { z-index: ... }` rule.
  host.style.cssText = [
    "position: fixed !important",
    "inset: 0 !important",
    "width: 0 !important",
    "height: 0 !important",
    "margin: 0 !important",
    "padding: 0 !important",
    "border: 0 !important",
    "pointer-events: none !important",
    "z-index: 2147483647 !important",
    // Don't let a transformed/filtered ancestor trap us in its stacking context.
    "transform: none !important",
    "filter: none !important",
  ].join(";");
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.style.pointerEvents = "none";
  shadow.appendChild(mountPoint);

  render(
    h(Overlay, {
      store,
      hostEl: host,
      identity: options.identity ?? null,
      ...(options.onNavigate ? { onNavigate: options.onNavigate } : {}),
    }),
    mountPoint,
  );

  return {
    host,
    unmount() {
      render(null, mountPoint);
      host?.remove();
    },
  };
}
