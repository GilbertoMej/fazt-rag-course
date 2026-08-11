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
}

export interface AskSqlResponse {
  answer: string;
  sql: string;
  rows: unknown[];
  row_count: number;
}

export type AskMode = "rag" | "sql";
export type AskResponse = AskRagResponse | AskSqlResponse;

export interface IngestResponse {
  ingested: number;
  chunks: number;
  ids: number[];
}

/**
 * Llama al endpoint `ask` con el modo elegido.
 * - mode = "rag" (default): retrieval + LLM sobre `documents`
 * - mode = "sql": Text-to-SQL sobre `fma_tracks` (u otras tablas)
 */
export function askQuestion(question: string): Promise<AskRagResponse>;
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
  const { matchCount = 5, mode = "rag", maxRows = 100 } = options;
  const body: Record<string, unknown> = { question, mode };
  if (mode === "rag") body.match_count = matchCount;
  else body.max_rows = maxRows;

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
