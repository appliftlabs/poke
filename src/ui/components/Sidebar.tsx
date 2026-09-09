import type { PokeThread } from "../../core/types.js";
import { relTime } from "../util.js";
import { Avatar } from "./Avatar.js";

interface SidebarProps {
  open: boolean;
  /** Every thread across the app. */
  threads: PokeThread[];
  /** The page the overlay is currently on — its threads render as pins. */
  currentPageId: string;
  activeId: string | null;
  onClose: () => void;
  /** Select a thread. `samesPage` is false when it lives on another route. */
  onSelect: (thread: PokeThread, samePage: boolean) => void;
}

/** "/projects/42" -> "projects / 42"; "/" -> "home" */
function prettyPage(pageId: string): string {
  const s = pageId.replace(/^\/+|\/+$/g, "");
  return s ? s.replace(/\//g, " / ") : "home";
}

export function Sidebar({
  open,
  threads,
  currentPageId,
  activeId,
  onClose,
  onSelect,
}: SidebarProps) {
  const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  // Group: this page first, then other pages by most-recent activity.
  const thisPage = sorted.filter((t) => t.pageId === currentPageId);
  const otherByPage = new Map<string, PokeThread[]>();
  for (const t of sorted) {
    if (t.pageId === currentPageId) continue;
    const list = otherByPage.get(t.pageId) ?? [];
    list.push(t);
    otherByPage.set(t.pageId, list);
  }

  const openCount = threads.filter((t) => t.status === "open").length;

  const renderItem = (t: PokeThread, samePage: boolean) => {
    const first = t.messages[0];
    return (
      <div
        key={t.id}
        class="poke-listitem"
        style={activeId === t.id ? { background: "#eff6ff" } : undefined}
        onClick={() => onSelect(t, samePage)}
      >
        <span class="poke-dot" data-status={t.status} />
        <div class="poke-listitem__main">
          <div class="poke-listitem__snippet">{first?.body ?? "(empty)"}</div>
          <div class="poke-listitem__sub">
            {t.author.name} · {relTime(t.updatedAt)}
            {t.messages.length > 1 ? ` · ${t.messages.length} replies` : ""}
            {samePage && t.resolution && !t.resolution.found
              ? " · unanchored"
              : ""}
            {!samePage ? " · ↗ another page" : ""}
          </div>
        </div>
        {first && <Avatar user={first.author} size={20} />}
      </div>
    );
  };

  return (
    <div
      class={`poke-sidebar${open ? " poke-sidebar--open" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div class="poke-sidebar__head">
        <span>
          Comments ({threads.length}
          {threads.length ? `, ${openCount} open` : ""})
        </span>
        <button class="poke-iconbtn" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div class="poke-sidebar__list">
        {sorted.length === 0 && (
          <div class="poke-empty">
            No comments yet. Turn on comment mode and click anything on the page.
          </div>
        )}

        {thisPage.length > 0 && (
          <>
            <div class="poke-sidebar__group">This page</div>
            {thisPage.map((t) => renderItem(t, true))}
          </>
        )}

        {[...otherByPage.entries()].map(([pageId, list]) => (
          <div key={pageId}>
            <div class="poke-sidebar__group" title={pageId}>
              {prettyPage(pageId)}
            </div>
            {list.map((t) => renderItem(t, false))}
          </div>
        ))}
      </div>
    </div>
  );
}
