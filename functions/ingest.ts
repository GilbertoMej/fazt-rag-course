// RAG ingest edge function
// POST { text: string, source?: string }
// Chunks text (~2000 chars / ~500 tokens, 200 char overlap), embeds via
// openai/text-embedding-3-small, inserts into public.documents.

import { createClient } from "npm:@insforge/sdk";
import OpenAI from "npm:openai";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const EMBED_MODEL = "openai/text-embedding-3-small";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function chunk(text: string, size = 2000, overlap = 200): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= size) return [clean];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    out.push(clean.slice(i, end));
    if (end === clean.length) break;
    i = end - overlap;
  }
  return out;
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: cors,
    });
  }

  const body = (await req.json().catch(() => null)) as
    | { text?: unknown; source?: unknown }
    | null;
  if (
    !body ||
    typeof body.text !== "string" ||
    body.text.trim().length === 0 ||
    body.text.length > 100_000
  ) {
    return json({ error: "text required (string, 1..100000 chars)" }, 400);
  }

  const source = typeof body.source === "string" ? body.source : null;

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const anonKey = Deno.env.get("ANON_KEY");
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY not set" }, 500);
  if (!baseUrl || !anonKey) {
    return json({ error: "INSFORGE_BASE_URL / ANON_KEY not set" }, 500);
  }

  const openai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
  const chunks = chunk(body.text);
  const embRes = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: chunks,
  });
  const rows = chunks.map((c, i) => ({
    content: c,
    source,
    embedding: embRes.data[i].embedding,
  }));

  const insforge = createClient({ baseUrl, anonKey });
  const { data, error } = await insforge.database
    .from("documents")
    .insert(rows)
    .select("id");
  if (error) return json({ error: error.message }, 500);

  const ids = (data ?? []).map((r: { id: number }) => r.id);
  return json({ ingested: ids.length, chunks: chunks.length, ids });
}
