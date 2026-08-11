import { insforge } from "./insforge";

export interface Source {
  id: number;
  source: string | null;
  similarity: number;
  excerpt: string;
}

export interface AskRagResponse {
  answer: string;
  sources: Source[];
  mode_used?: "rag";
}

export interface AskSqlResponse {
  answer: string;
  sql: string;
  rows: unknown[];
  row_count: number;
  mode_used?: "sql";
}

export type AskMode = "rag" | "sql" | "auto";
export type AskResponse = AskRagResponse | AskSqlResponse;

export interface IngestResponse {
  ingested: number;
  chunks: number;
  ids: number[];
}

/**
 * Llama al endpoint `ask` con el modo elegido.
 * - mode = "auto" (default): el router LLM decide sql vs rag
 * - mode = "rag": retrieval + LLM sobre `documents`
 * - mode = "sql": Text-to-SQL sobre `fma_tracks` (u otras tablas)
 */
export function askQuestion(question: string): Promise<AskResponse>;
export function askQuestion(
  question: string,
  options: { mode: "auto" },
): Promise<AskResponse>;
export function askQuestion(
  question: string,
  options: { mode: "rag"; matchCount?: number },
): Promise<AskRagResponse>;
export function askQuestion(
  question: string,
  options: { mode: "sql"; maxRows?: number },
): Promise<AskSqlResponse>;
export async function askQuestion(
  question: string,
  options: { matchCount?: number; mode?: AskMode; maxRows?: number } = {},
): Promise<AskResponse> {
  const { matchCount = 5, mode = "auto", maxRows = 100 } = options;
  const body: Record<string, unknown> = { question, mode };
  if (mode === "rag") body.match_count = matchCount;
  else if (mode === "sql") body.max_rows = maxRows;

  const { data, error } = await insforge.functions.invoke<AskResponse>("ask", {
    body,
  });
  if (error) throw new Error(error.message);
  return data!;
}

export async function ingestText(
  text: string,
  source: string,
): Promise<IngestResponse> {
  const { data, error } = await insforge.functions.invoke<IngestResponse>(
    "ingest",
    { body: { text, source } },
  );
  if (error) throw new Error(error.message);
  return data!;
}
