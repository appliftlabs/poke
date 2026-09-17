/**
 * Plain Node `http`/`http2` integration — for Express, Fastify (via its raw
 * handler), or a bare `http.createServer`.
 *
 *   import { createServer } from "node:http";
 *   import { createPoke } from "@appliftlabs/poke/server";
 *   import { toNodeHandler } from "@appliftlabs/poke/node";
 *   import { Pool } from "pg";
 *
 *   const poke = createPoke({
 *     database: new Pool({ connectionString: process.env.DATABASE_URL }),
 *   });
 *
 *   createServer(toNodeHandler(poke.handler)).listen(4000);
 *
 * Express: mount it under a path so only matching requests reach it —
 *
 *   app.all("/api/poke/*", toNodeHandler(poke.handler));
 */
import type { IncomingMessage, ServerResponse } from "node:http";

export type NodeHandler = (req: IncomingMessage, res: ServerResponse) => void;

function nodeRequestToWebRequest(req: IncomingMessage): Request {
  const protocol =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else headers.set(key, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  return new Request(url, {
    method: req.method ?? "GET",
    headers,
    // Node's IncomingMessage is a Readable; the Request constructor accepts
    // any async iterable as a duplex body stream.
    ...(hasBody ? { body: req as unknown as ReadableStream, duplex: "half" } : {}),
  });
}

async function writeWebResponse(
  webRes: Response,
  res: ServerResponse,
): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));

  if (!webRes.body) {
    res.end();
    return;
  }

  const reader = webRes.body.getReader();
  res.on("close", () => reader.cancel().catch(() => {}));

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    res.end();
  }
}

export function toNodeHandler(
  handler: (req: Request) => Promise<Response>,
): NodeHandler {
  return (req, res) => {
    void Promise.resolve(nodeRequestToWebRequest(req))
      .then((webReq) => handler(webReq))
      .then((webRes) => writeWebResponse(webRes, res))
      .catch((err) => {
        console.error("[poke]", err);
        if (!res.headersSent) res.statusCode = 500;
        res.end();
      });
  };
}
