import type { PokeThread, PokeUser } from "../../core/types.js";
import { relTime } from "../util.js";
import { Avatar } from "./Avatar.js";
import { Composer } from "./Composer.js";

interface ThreadCardProps {
  thread: PokeThread;
  currentUser: PokeUser;
  style: { left: number; top: number };
  onReply: (body: string) => void;
  onResolveToggle: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function ThreadCard({
  thread,
  currentUser,
  style,
  onReply,
  onResolveToggle,
  onDelete,
  onClose,
}: ThreadCardProps) {
  const resolved = thread.status === "resolved";
  const lost = thread.resolution && !thread.resolution.found;

  return (
    <div class="poke-card" style={style} onClick={(e) => e.stopPropagation()}>
      <div class="poke-card__head">
        <span class="poke-card__title">
          {resolved ? "Resolved" : "Comment"}
          {thread.messages.length > 1 ? ` · ${thread.messages.length}` : ""}
        </span>
        <div class="poke-row">
          <button
            class="poke-iconbtn"
            title={resolved ? "Reopen" : "Mark resolved"}
            onClick={onResolveToggle}
          >
            {resolved ? "↩ Reopen" : "✓ Resolve"}
          </button>
          {thread.author.id === currentUser.id && (
            <button class="poke-iconbtn" title="Delete thread" onClick={onDelete}>
              🗑
            </button>
          )}
          <button class="poke-iconbtn" title="Close" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {lost && (
        <div class="poke-warn">
          Couldn’t locate the element this comment was left on — the page may have
          changed. Showing it at its last known position.
        </div>
      )}

      <div class="poke-card__body">
        {thread.messages.map((m) => (
          <div class="poke-msg" key={m.id}>
            <div class="poke-msg__meta">
              <Avatar user={m.author} />
              <span class="poke-msg__author">{m.author.name}</span>
              <span class="poke-msg__time">
                {relTime(m.createdAt)}
                {m.editedAt ? " · edited" : ""}
              </span>
            </div>
            <div class="poke-msg__body">{m.body}</div>
          </div>
        ))}
      </div>

      <Composer
        placeholder="Reply…"
        submitLabel="Reply"
        autoFocus={false}
        onSubmit={onReply}
      />
    </div>
  );
}
