/**
 * FastAPI（同一コンテナの 127.0.0.1:8000）へのプロキシ。
 *
 * next.config の rewrites ではなく Route Handler にしているのは、SSE を
 * バッファさせずにそのまま流したいから。fetch のレスポンス body（ReadableStream）を
 * 加工せず返せば、チャンクが届いた順にブラウザへ渡る。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://127.0.0.1:8000";

async function proxy(req: Request, path: string[]): Promise<Response> {
  const url = new URL(req.url);
  const target = `${API_ORIGIN}/api/${path.join("/")}${url.search}`;

  const headers = new Headers();
  for (const name of ["content-type", "accept", "cookie"]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : await req.text(),
    // @ts-expect-error Node の undici 拡張。ストリーミング応答に必要
    duplex: "half",
    cache: "no-store",
  });

  const out = new Headers();
  for (const name of ["content-type", "cache-control", "set-cookie"]) {
    const v = upstream.headers.get(name);
    if (v) out.set(name, v);
  }
  out.set("X-Accel-Buffering", "no");

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}
