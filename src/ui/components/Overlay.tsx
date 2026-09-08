import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { useStoreThreads } from "../use-store.js";
import { anchorPoint, captureAnchor, resolveAnchor } from "../../anchor/index.js";
import type { LocalIdentity } from "../../core/identity.js";
import type { CommentStore } from "../../core/store.js";
import type { PokeThread } from "../../core/types.js";
import { clampToViewport } from "../util.js";
import { Composer } from "./Composer.js";
import { NamePrompt } from "./NamePrompt.js";
import { Sidebar } from "./Sidebar.js";
import { ThreadCard } from "./ThreadCard.js";

interface OverlayProps {
  store: CommentStore;
  /** Host element to ignore clicks on (Poke's own shadow host). */
  hostEl: Element;
  /** Browser-local identity, when Poke is managing one. */
  identity: LocalIdentity | null;
}

type Draft = {
  anchor: ReturnType<typeof captureAnchor>;
  point: { x: number; y: number };
};

/** Point in *viewport* coords for a thread, or null if we can't place it. */
function pinViewportPoint(thread: PokeThread): { x: number; y: number } | null {
  const { element } = resolveAnchor(thread.anchor);
  if (element) {
    const p = anchorPoint(element, thread.anchor);
    return { x: p.x - window.scrollX, y: p.y - window.scrollY };
  }
  // Fallback: last known absolute position.
  const v = thread.anchor.viewport;
  return { x: v.x - window.scrollX, y: v.y - window.scrollY };
}

export function Overlay({ store, hostEl, identity }: OverlayProps) {
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  // Threads, kept live via a synchronous store subscription.
  const threads = useStoreThreads(store);

  const [mode, setMode] = useState<"idle" | "comment">("idle");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hoverRect, setHoverRect] = useState<DOMRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Name gate: when an unnamed viewer submits, stash the action and show the
  // name prompt; run the action once they've picked a name.
  const needsName = !!identity && !identity.isNamed;
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [editingName, setEditingName] = useState(false);

  const withName = (action: () => void) => {
    if (needsName) setPendingAction(() => action);
    else action();
  };

  const saveName = (name: string) => {
    identity?.setName(name);
    store.setUser(identity!.user);
    setEditingName(false);
    const next = pendingAction;
    setPendingAction(null);
    next?.();
  };

  // Re-render on scroll/resize so pins track the elements they're anchored to.
  useEffect(() => {
    const onScroll = () => rerender();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [rerender]);

  // Comment-mode: hover highlight + capture click on the host page.
  useEffect(() => {
    if (mode !== "comment") {
      setHoverRect(null);
      return;
    }

    const isOurs = (t: EventTarget | null) =>
      t instanceof Node && hostEl.contains(t);

    const onMove = (e: PointerEvent) => {
      if (isOurs(e.target)) {
        setHoverRect(null);
        return;
      }
      const el = e.target as HTMLElement | null;
      setHoverRect(el ? el.getBoundingClientRect() : null);
    };

    const onClick = (e: MouseEvent) => {
      if (isOurs(e.target)) return;
      const el = e.target as HTMLElement | null;
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      const anchor = captureAnchor(el, { clientX: e.clientX, clientY: e.clientY });
      setDraft({ anchor, point: { x: e.clientX, y: e.clientY } });
      setMode("idle");
      setActiveId(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("idle");
    };

    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [mode, hostEl]);

  const openCount = threads.filter((t) => t.status === "open").length;
  const activeThread = activeId
    ? threads.find((t) => t.id === activeId)
    : undefined;

  const commitDraft = (body: string) => {
    if (!draft) return;
    withName(async () => {
      const created = await store.createThread({ anchor: draft.anchor, body });
      setDraft(null);
      setActiveId(created.id);
    });
  };

  const commitReply = (threadId: string, body: string) => {
    withName(() => void store.reply(threadId, body));
  };

  const focusThread = (t: PokeThread) => {
    setActiveId(t.id);
    setSidebarOpen(false);
    const p = pinViewportPoint(t);
    // If the pin is off-screen, scroll the page to bring it into view.
    if (p && (p.y < 0 || p.y > window.innerHeight)) {
      window.scrollTo({
        top: window.scrollY + p.y - window.innerHeight / 2,
        behavior: "smooth",
      });
    }
  };

  return (
    <div
      ref={rootRef}
      class="poke-root"
      data-mode={mode}
      onClick={() => {
        setActiveId(null);
        setDraft(null);
      }}
    >
      {mode === "comment" && hoverRect && (
        <div
          class="poke-hover-outline"
          style={{
            left: hoverRect.left,
            top: hoverRect.top,
            width: hoverRect.width,
            height: hoverRect.height,
          }}
        />
      )}

      {/* pins */}
      {threads.map((t) => {
        const p = pinViewportPoint(t);
        if (!p) return null;
        const lost = t.resolution ? !t.resolution.found : false;
        const n = threads.indexOf(t) + 1;
        return (
          <button
            key={t.id}
            class={`poke-pin${activeId === t.id ? " poke-pin--active" : ""}`}
            data-status={t.status}
            data-lost={lost ? "true" : "false"}
            style={{ left: p.x, top: p.y }}
            title={t.messages[0]?.body ?? ""}
            onClick={(e) => {
              e.stopPropagation();
              setActiveId(activeId === t.id ? null : t.id);
              setDraft(null);
              setSidebarOpen(false);
            }}
          >
            {n}
          </button>
        );
      })}

      {/* draft composer */}
      {draft &&
        (() => {
          const pos = clampToViewport(draft.point.x + 12, draft.point.y + 12, 320, 200);
          return (
            <div class="poke-card" style={pos} onClick={(e) => e.stopPropagation()}>
              <div class="poke-card__head">
                <span class="poke-card__title">New comment</span>
                <button
                  class="poke-iconbtn"
                  onClick={() => setDraft(null)}
                  title="Discard"
                >
                  ✕
                </button>
              </div>
              <Composer
                onSubmit={commitDraft}
                onCancel={() => setDraft(null)}
                submitLabel="Comment"
              />
            </div>
          );
        })()}

      {/* active thread */}
      {activeThread &&
        (() => {
          const p = pinViewportPoint(activeThread);
          if (!p) return null;
          const pos = clampToViewport(p.x + 16, p.y - 40, 320, 340);
          return (
            <ThreadCard
              thread={activeThread}
              currentUser={store.user}
              style={pos}
              onReply={(body) => commitReply(activeThread.id, body)}
              onResolveToggle={() =>
                store.setStatus(
                  activeThread.id,
                  activeThread.status === "resolved" ? "open" : "resolved",
                )
              }
              onDelete={() => {
                store.deleteThread(activeThread.id);
                setActiveId(null);
              }}
              onClose={() => setActiveId(null)}
            />
          );
        })()}

      {/* name prompt — either gating a pending comment/reply, or an explicit
          "set / change name" from the toolbar */}
      {(pendingAction || editingName) && (
        <NamePrompt
          title={editingName ? "Your name" : "Add your name to comment"}
          initial={identity?.name ?? ""}
          style={clampToViewport(
            window.innerWidth / 2 - 160,
            window.innerHeight - 260,
            320,
            220,
          )}
          onSubmit={saveName}
          onCancel={() => {
            setPendingAction(null);
            setEditingName(false);
          }}
        />
      )}

      <Sidebar
        open={sidebarOpen}
        threads={threads}
        activeId={activeId}
        onClose={() => setSidebarOpen(false)}
        onSelect={focusThread}
      />

      {/* toolbar */}
      <div class="poke-toolbar" onClick={(e) => e.stopPropagation()}>
        <button
          class={`poke-btn${mode === "comment" ? " poke-btn--primary" : ""}`}
          onClick={() => {
            setMode(mode === "comment" ? "idle" : "comment");
            setDraft(null);
            setActiveId(null);
          }}
        >
          {mode === "comment" ? "● Click an element…" : "💬 Comment"}
        </button>
        <span class="poke-count">
          {openCount} open{threads.length !== openCount ? ` · ${threads.length} total` : ""}
        </span>
        <button
          class="poke-btn poke-btn--ghost"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          ☰ All
        </button>
        {identity && (
          <span class="poke-identity">
            {identity.isNamed ? (
              <>
                <span>{identity.name}</span>
                <button onClick={() => setEditingName(true)}>change</button>
              </>
            ) : (
              <button onClick={() => setEditingName(true)}>Set your name</button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
