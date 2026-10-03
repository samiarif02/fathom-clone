import type { Bindings } from "./env";

const enc = new TextEncoder();

async function hmac(env: Bindings, message: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.MEDIA_SIGNING_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A short-lived URL for <video src>, which can't send an Authorization header. */
export async function signedMediaUrl(env: Bindings, key: string, ttlSeconds = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmac(env, `${key}:${exp}`);
  return `/api/media/${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
}

/** Streams an R2 object, honouring Range requests so the player can seek. */
export async function serveMedia(env: Bindings, req: Request, key: string) {
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!exp || exp < Date.now() / 1000 || sig !== (await hmac(env, `${key}:${exp}`))) {
    return new Response("Link expired", { status: 403 });
  }
  const obj = await env.MEDIA.get(key, { range: req.headers, onlyIf: req.headers });
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");
  if (!("body" in obj)) return new Response(null, { status: 304, headers });
  const r = obj.range as { offset?: number; length?: number } | undefined;
  if (req.headers.has("range") && r && r.offset !== undefined) {
    const length = r.length ?? obj.size - r.offset;
    headers.set("content-range", `bytes ${r.offset}-${r.offset + length - 1}/${obj.size}`);
    headers.set("content-length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("content-length", String(obj.size));
  return new Response(obj.body, { headers });
}
