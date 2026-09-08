/**
 * Creates an isolated Shadow-DOM host on the page and renders Poke's UI into it.
 * Everything Poke draws lives inside this shadow root, so the host page's CSS
 * cannot affect it and its CSS cannot affect the host page.
 */
import { h, render } from "preact";
import type { CommentStore } from "../core/store.js";
import { Overlay } from "./components/Overlay.js";
import { CSS } from "./styles.js";

const HOST_ID = "poke-overlay-host";

export interface MountHandle {
  unmount(): void;
  host: HTMLElement;
}

export function mountUI(store: CommentStore): MountHandle {
  // Reuse an existing host if Poke was mounted before (HMR, double-init).
  let host = document.getElementById(HOST_ID) as HTMLElement | null;
  if (host) host.remove();

  host = document.createElement("div");
  host.id = HOST_ID;
  // The host itself takes no space and never intercepts pointer events; the
  // overlay inside re-enables pointer events on just its interactive bits.
  host.style.cssText =
    "position:fixed;inset:0;width:0;height:0;pointer-events:none;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.style.pointerEvents = "none";
  shadow.appendChild(mountPoint);

  render(h(Overlay, { store, hostEl: host }), mountPoint);

  return {
    host,
    unmount() {
      render(null, mountPoint);
      host?.remove();
    },
  };
}
