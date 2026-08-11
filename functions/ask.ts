// Hybrid ask edge function.
//
// POST { question: string, mode?: "sql" | "rag", match_count?: number, max_rows?: number }
// mode default = "sql"
//
// mode = "rag": embed question → match_documents → answer from context (RAG)
//   returns { answer, sources }
//
// mode = "sql": LLM generates a single PostgreSQL SELECT (schema is hardcoded
//   in the prompt), validated edge-side and server-side via the run_select
//   RPC, then a second LLM call writes the Spanish answer from the rows.
//   returns { answer, sql, rows, row_count }

import { createClient } from "npm:@insforge/sdk";
import OpenAI from "npm:openai";

const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const EMBED_MODEL = "openai/text-embedding-3-small";
const CHAT_MODEL = "openai/gpt-4o-mini";

const RAG_SYSTEM = [
  "Eres un asistente que responde SOLO con la información del contexto provisto.",
  'Si la respuesta NO está en el contexto, responde exactamente: "No tengo esa información en mis documentos."',
  "No inventes. Cita el número de fuente (ej. [Fuente 1]) cuando uses información.",
].join(" ");

const SCHEMA_DESCRIPTION = `
Esquema de la base de datos (PostgreSQL):

Tabla public.fma_tracks (Free Music Archive — 106575 filas):
  track_id TEXT PRIMARY KEY
  album_comments, album_date_created, album_date_released, album_engineer,
  album_favorites, album_id, album_information, album_listens, album_producer,
  album_tags, album_title, album_tracks, album_type TEXT
  artist_active_year_begin, artist_active_year_end, artist_associated_labels,
  artist_bio, artist_comments, artist_date_created, artist_favorites,
  artist_id, artist_latitude, artist_location, artist_longitude,
  artist_members, artist_name, artist_related_projects, artist_tags,
  artist_website, artist_wikipedia_page TEXT
  set_split, set_subset TEXT
  track_bit_rate, track_comments, track_composer, track_date_created,
  track_date_recorded, track_duration, track_favorites, track_genre_top,
  track_genres, track_genres_all, track_information, track_interest,
  track_language_code, track_license, track_listens, track_lyricist,
  track_number, track_publisher, track_tags, track_title TEXT

Tabla public.documents (RAG chunks — embeddings):
  id BIGSERIAL PK, content TEXT, source TEXT,
  embedding vector(1536), embedding_model TEXT, created_at TIMESTAMPTZ

Notas:
- album_title y artist_name son las columnas correctas (NO title/name sueltos).
- track_genre_top tiene los 16 géneros top (Hip-Hop, Pop, Rock, etc.).
- "más comentarios" → SUM/MAX sobre album_comments o track_comments.
- "más canciones por álbum" → COUNT(*) sobre track_id agrupado por album_id
  (cada fila de fma_tracks es una canción).
`.trim();

const SQL_GEN_SYSTEM = `${SCHEMA_DESCRIPTION}

Eres un generador de SQL para PostgreSQL.
- Devuelve SOLO una sentencia SELECT (o WITH ... SELECT) válida.
- Sin punto y coma al final.
- Sin explicaciones, sin fences markdown, sin comentarios.
- Usa solo las tablas y columnas del esquema descrito.
- Para "álbum con más X" usa GROUP BY album_id, album_title.
- Para "no repetir" usa DISTINCT o GROUP BY.
- Si la pregunta no se puede responder con SELECT puro, devuelve:
  SELECT NULL::text AS no_aplicable;`;

const SQL_ANSWER_SYSTEM = `Eres un asistente que redacta respuestas en español a partir de datos.
- Responde de forma concisa y natural.
- Usa solo la información de las filas provistas.
- Si las filas están vacías, di "No hay resultados para esa consulta."
- No inventes datos que no estén en las filas.`;

const FORBIDDEN = /\m(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|vacuum|reindex)\M/i;

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

function validateSqlEdge(sql: string): { ok: true; sql: string } | { ok: false; error: string } {
  const trimmed = sql.trim();
  // strip leading ```sql / ``` fences if the model added them
  const cleaned = trimmed
    .replace(/^```(?:sql)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const lower = cleaned.toLowerCase();
  if (!/^(select|with)\s/.test(lower)) {
    return { ok: false, error: "SQL debe iniciar con SELECT o WITH" };
  }
  if (FORBIDDEN.test(cleaned)) {
    return { ok: false, error: "SQL contiene palabras prohibidas" };
  }
  // disallow inner semicolons (multi-statement). trailing one is OK.
  const withoutTrailing = lower.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return { ok: false, error: "Solo se permite una sentencia" };
  }
  return { ok: true, sql: cleaned.replace(/;\s*$/, "") };
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        question?: unknown;
        mode?: unknown;
        match_count?: unknown;
        max_rows?: unknown;
      }
    | null;
  if (!body || typeof body.question !== "string" || body.question.trim() === "") {
    return json({ error: "question required (string)" }, 400);
  }

  const mode = body.mode === "rag" ? "rag" : "sql";

  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL");
  const anonKey = Deno.env.get("ANON_KEY");
  if (!apiKey) return json({ error: "OPENROUTER_API_KEY not set" }, 500);
  if (!baseUrl || !anonKey) {
    return json({ error: "INSFORGE_BASE_URL / ANON_KEY not set" }, 500);
  }

  const insforge = createClient({ baseUrl, anonKey });
  const openai = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });

  if (mode === "rag") return handleRag(req, body, openai, insforge);
  return handleSql(req, body, openai, insforge);
}

async function handleRag(
  _req: Request,
  body: { question: string; match_count?: unknown },
  openai: OpenAI,
  insforge: ReturnType<typeof createClient>,
): Promise<Response> {
  const matchCount = Math.min(Math.max(Number(body.match_count ?? 5), 1), 20);
  const qEmb = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: body.question,
  });
  const queryVec = qEmb.data[0].embedding;
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
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: RAG_SYSTEM },
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

async function handleSql(
  _req: Request,
  body: { question: string; max_rows?: unknown },
  openai: OpenAI,
  insforge: ReturnType<typeof createClient>,
): Promise<Response> {
  // 1) generate SQL
  const gen = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SQL_GEN_SYSTEM },
      { role: "user", content: body.question },
    ],
    temperature: 0,
  });
  const rawSql = (gen.choices[0]?.message?.content ?? "").trim();

  const check = validateSqlEdge(rawSql);
  if (!check.ok) {
    return json({ error: check.error, sql: rawSql }, 400);
  }

  // 2) execute via RPC
  const { data: rows, error } = await insforge.database.rpc<unknown[]>(
    "run_select",
    { query: check.sql },
  );
  if (error) return json({ error: error.message, sql: check.sql }, 400);

  const rowArr = Array.isArray(rows) ? rows : [];
  const rowCount = rowArr.length;

  // truncate rows payload for the second LLM call (~6 KB)
  const rowsForLlm = JSON.stringify(rowArr).slice(0, 6_000);

  // 3) write answer in Spanish
  const ans = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      { role: "system", content: SQL_ANSWER_SYSTEM },
      {
        role: "user",
        content: `Pregunta: ${body.question}\n\nFilas (${rowCount}):\n${rowsForLlm}`,
      },
    ],
    temperature: 0.3,
  });
  const answer = ans.choices[0]?.message?.content ?? "";

  return json({ answer, sql: check.sql, rows: rowArr, row_count: rowCount });
}
