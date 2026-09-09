/**
 * All of Poke's CSS, injected once into the Shadow root. Scoped there, so it
 * neither leaks onto the host page nor inherits from it. Uses its own font
 * stack and resets aggressively for the same reason.
 */
export const CSS = /* css */ `
  :host {
    all: initial;
    /* The real stacking wins on the host element (set in mount.ts); this keeps
       the shadow contents above each other predictably. */
    position: fixed;
    inset: 0;
    z-index: 2147483647;
  }
  * {
    box-sizing: border-box;
  }
  .poke-root {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    pointer-events: none;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
      Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.45;
    color: #1f2933;
  }

  /* ---- comment-mode affordance ---- */
  .poke-root[data-mode="comment"] {
    cursor: crosshair;
  }
  .poke-hover-outline {
    position: absolute;
    border: 2px solid #2563eb;
    border-radius: 4px;
    background: rgba(37, 99, 235, 0.08);
    pointer-events: none;
    transition: all 60ms linear;
  }

  /* ---- toolbar ---- */
  .poke-toolbar {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px;
    background: #ffffff;
    border: 1px solid #e4e7eb;
    border-radius: 999px;
    box-shadow: 0 6px 24px rgba(15, 23, 42, 0.16);
    pointer-events: auto;
  }
  .poke-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: #1f2933;
    font: inherit;
    padding: 8px 14px;
    border-radius: 999px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .poke-btn:hover {
    background: #f1f5f9;
  }
  .poke-btn--primary {
    background: #2563eb;
    color: #fff;
  }
  .poke-btn--primary:hover {
    background: #1d4ed8;
  }
  .poke-btn--ghost {
    color: #64748b;
  }
  .poke-count {
    font-size: 12px;
    color: #64748b;
    padding: 0 8px;
  }

  /* ---- pins ---- */
  .poke-pin {
    position: absolute;
    width: 28px;
    height: 28px;
    margin: -28px 0 0 -2px;
    border-radius: 50% 50% 50% 3px;
    background: #f59e0b;
    color: #1f2933;
    border: 2px solid #fff;
    box-shadow: 0 3px 10px rgba(15, 23, 42, 0.32);
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    pointer-events: auto;
    transition: transform 90ms ease;
  }
  .poke-pin:hover {
    transform: scale(1.12);
  }
  .poke-pin[data-status="resolved"] {
    background: #10b981;
    color: #fff;
  }
  .poke-pin[data-lost="true"] {
    background: #94a3b8;
    opacity: 0.7;
  }
  .poke-pin--active {
    outline: 3px solid rgba(37, 99, 235, 0.4);
  }

  /* ---- popover / composer ---- */
  .poke-card {
    position: absolute;
    width: 320px;
    max-width: calc(100vw - 24px);
    background: #fff;
    border: 1px solid #e4e7eb;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(15, 23, 42, 0.22);
    pointer-events: auto;
    overflow: hidden;
  }
  .poke-card__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid #f1f5f9;
  }
  .poke-card__title {
    font-weight: 600;
    font-size: 13px;
  }
  .poke-card__body {
    max-height: 320px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .poke-msg {
    padding: 10px 12px;
  }
  .poke-msg + .poke-msg {
    border-top: 1px solid #f8fafc;
  }
  .poke-msg__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .poke-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #cbd5e1;
    color: #fff;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 700;
    flex: none;
    overflow: hidden;
  }
  .poke-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .poke-msg__author {
    font-weight: 600;
    font-size: 13px;
  }
  .poke-msg__time {
    color: #94a3b8;
    font-size: 11px;
  }
  .poke-msg__body {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .poke-card__foot {
    border-top: 1px solid #f1f5f9;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .poke-input {
    width: 100%;
    resize: none;
    border: 1px solid #e4e7eb;
    border-radius: 8px;
    padding: 8px 10px;
    font: inherit;
    color: inherit;
    min-height: 60px;
    outline: none;
  }
  .poke-input:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }
  .poke-input--single {
    min-height: 0;
    height: 38px;
  }
  .poke-note {
    margin: 0;
    font-size: 12px;
    color: #64748b;
  }
  .poke-identity {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #64748b;
    padding: 0 6px;
    border-left: 1px solid #e4e7eb;
    margin-left: 2px;
  }
  .poke-identity button {
    appearance: none;
    border: none;
    background: transparent;
    color: #2563eb;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 4px;
  }
  .poke-identity button:hover {
    background: #eff6ff;
  }
  .poke-row {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    align-items: center;
  }
  .poke-row--between {
    justify-content: space-between;
  }
  .poke-warn {
    font-size: 12px;
    color: #b45309;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 6px 8px;
    margin: 8px 12px 0;
  }
  .poke-iconbtn {
    appearance: none;
    border: none;
    background: transparent;
    cursor: pointer;
    color: #94a3b8;
    padding: 4px;
    border-radius: 6px;
    font-size: 12px;
    line-height: 1;
  }
  .poke-iconbtn:hover {
    background: #f1f5f9;
    color: #1f2933;
  }

  /* ---- sidebar (list of all comments) ---- */
  .poke-sidebar {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 320px;
    max-width: 90vw;
    background: #fff;
    border-left: 1px solid #e4e7eb;
    box-shadow: -8px 0 32px rgba(15, 23, 42, 0.12);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    transition: transform 180ms ease;
    /* above pins, thread cards, and the toolbar */
    z-index: 10;
  }
  .poke-sidebar--open {
    transform: none;
  }
  .poke-sidebar__head {
    padding: 14px 16px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
  }
  .poke-sidebar__list {
    flex: 1;
    overflow-y: auto;
  }
  .poke-sidebar__group {
    position: sticky;
    top: 0;
    background: #f8fafc;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    padding: 6px 16px;
    border-bottom: 1px solid #eef2f6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .poke-listitem {
    padding: 12px 16px;
    border-bottom: 1px solid #f8fafc;
    cursor: pointer;
    display: flex;
    gap: 10px;
  }
  .poke-listitem:hover {
    background: #f8fafc;
  }
  .poke-listitem__main {
    min-width: 0;
    flex: 1;
  }
  .poke-listitem__snippet {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .poke-listitem__sub {
    font-size: 12px;
    color: #94a3b8;
  }
  .poke-empty {
    padding: 32px 16px;
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
  }
  .poke-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f59e0b;
    margin-top: 6px;
    flex: none;
  }
  .poke-dot[data-status="resolved"] {
    background: #10b981;
  }
`;
