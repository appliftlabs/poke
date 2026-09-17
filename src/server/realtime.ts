/**
 * In-process SSE fanout. A subscriber on `pageId` is notified of writes to that
 * page; a subscriber on `*` is notified of every write in the project.
 *
 * This is genuinely in-memory — it only sees writes made by requests handled in
 * *this* process. That's the right tradeoff for a long-lived Node server (one
 * process, all requests) and a known limitation on serverless/edge platforms
 * that run many short-lived instances: two people hitting different instances
 * won't see each other's live updates over SSE, though every read still goes to
 * the same database, so a manual refresh (or Poke's own poll-on-focus) always
 * shows the truth. See the "Realtime & deployment" doc section.
 */
export type SseSink = {
  write: (chunk: string) => void;
  close: () => void;
};

export class Realtime {
  /** key `${project}::${pageId}` -> sinks. `pageId` "*" is the wildcard channel. */
  private channels = new Map<string, Set<SseSink>>();
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  private key(project: string, pageId: string): string {
    return `${project}::${pageId}`;
  }

  subscribe(project: string, pageId: string, sink: SseSink): () => void {
    const key = this.key(project, pageId);
    let set = this.channels.get(key);
    if (!set) this.channels.set(key, (set = new Set()));
    set.add(sink);

    if (!this.heartbeat) {
      // Keep proxies/load balancers from dropping idle SSE connections.
      this.heartbeat = setInterval(() => {
        for (const sinks of this.channels.values()) {
          for (const s of sinks) {
            try {
              s.write(`: ping\n\n`);
            } catch {
              /* cleaned up when the request's abort signal fires */
            }
          }
        }
      }, 25_000);
      this.heartbeat.unref?.();
    }

    return () => {
      set!.delete(sink);
      if (set!.size === 0) this.channels.delete(key);
    };
  }

  /** Notify subscribers of `pageId` and of the wildcard channel. */
  publish(project: string, pageId: string): void {
    this.writeChanged(this.channels.get(this.key(project, pageId)));
    this.writeChanged(this.channels.get(this.key(project, "*")));
  }

  private writeChanged(sinks: Set<SseSink> | undefined): void {
    if (!sinks) return;
    for (const s of sinks) {
      try {
        s.write(`data: changed\n\n`);
      } catch {
        /* cleaned up on abort */
      }
    }
  }
}
