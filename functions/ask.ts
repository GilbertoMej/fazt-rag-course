// RAG ask edge function
// POST { question: string, match_count?: number }
// Embeds question, retrieves top-k via match_documents, asks gpt-4o-mini to
// answer strictly from context. Returns { answer, sources }.

import { createClient } from "npm:@insforge/sdk";
import OpenAI from "npm:openai";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const EMBED_MODEL = "openai/text-embedding-3-small";
const CHAT_MODEL = "openai/gpt-4o-mini";

const SYSTEM = [
  "Eres un asistente que responde SOLO con la información del contexto provisto.",
  'Si la respuesta NO está en el contexto, responde exactamente: "No tengo esa información en mis documentos."',
  "No inventes. Cita el número de fuente (ej. [Fuente 1]) cuando uses información.",
].join(" ");

interface Match {
  id: number;
  content: string;
  source: string | null;
  similarity: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
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
    | { question?: unknown; match_count?: unknown }
    | null;
  if (!body || typeof body.question !== "string" || body.question.trim() === "") {
    return json({ error: "question required (string)" }, 400);
  }
  const matchCount = Math.min(Math.max(Number(body.match_count ?? 5), 1), 20);

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const anonKey = Deno.env.get("ANON_KEY");
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY not set" }, 500);
  if (!baseUrl || !anonKey) {
    return json({ error: "INSFORGE_BASE_URL / ANON_KEY not set" }, 500);
  }

  const openai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });

  // 1) embed question
  const qEmb = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: body.question,
  });
  const queryVec = qEmb.data[0].embedding;

  // 2) retrieve top-k (threshold 0.0 so the LLM gets to see weak matches
  //    and apply the "no tengo esa información" fallback itself)
  const insforge = createClient({ baseUrl, anonKey });
  const { data: rawMatches, error } = await insforge.database.rpc<Match[]>(
    "match_documents",
    {
      query_embedding: queryVec,
      match_count: matchCount,
      match_threshold: 0.0,
    },
  );
  if (error) return json({ error: error.message }, 500);

  const matches: Match[] = rawMatches ?? [];

  const context = matches.length
    ? matches
        .map((m, i) => `[Fuente ${i + 1}${m.source ? ` (${m.source})` : ""}]\n${m.content}`)
        .join("\n\n")
    : "(sin resultados)";

  // 3) chat completion
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "system", content: `Contexto:\n${context}` },
      { role: "user", content: body.question },
    ],
    temperature: 0.2,
  });

  const answer = completion.choices[0]?.message?.content ?? "";
  const sources = matches.map((m) => ({
    id: m.id,
    source: m.source,
    similarity: m.similarity,
    excerpt: m.content.slice(0, 160),
  }));

  return json({ answer, sources });
}
