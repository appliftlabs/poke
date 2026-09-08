import type { PokeThread } from "../../core/types.js";
import { relTime } from "../util.js";
import { Avatar } from "./Avatar.js";

interface SidebarProps {
  open: boolean;
  threads: PokeThread[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (thread: PokeThread) => void;
}

export function Sidebar({
  open,
  threads,
  activeId,
  onClose,
  onSelect,
}: SidebarProps) {
  const sorted = [...threads].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div
      class={`poke-sidebar${open ? " poke-sidebar--open" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div class="poke-sidebar__head">
        <span>Comments ({threads.length})</span>
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
        {sorted.map((t) => {
          const first = t.messages[0];
          return (
            <div
              key={t.id}
              class="poke-listitem"
              style={
                activeId === t.id ? { background: "#eff6ff" } : undefined
              }
              onClick={() => onSelect(t)}
            >
              <span class="poke-dot" data-status={t.status} />
              <div class="poke-listitem__main">
                <div class="poke-listitem__snippet">{first?.body ?? "(empty)"}</div>
                <div class="poke-listitem__sub">
                  {t.author.name} · {relTime(t.updatedAt)}
                  {t.messages.length > 1 ? ` · ${t.messages.length} replies` : ""}
                  {t.resolution && !t.resolution.found ? " · unanchored" : ""}
                </div>
              </div>
              {first && <Avatar user={first.author} size={20} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
