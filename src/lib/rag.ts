import { insforge } from "./insforge";

export interface Source {
  id: number;
  source: string | null;
  similarity: number;
  excerpt: string;
}

export interface AskResponse {
  answer: string;
  sources: Source[];
}

export interface IngestResponse {
  ingested: number;
  chunks: number;
  ids: number[];
}

export async function askQuestion(
  question: string,
  matchCount = 5,
): Promise<AskResponse> {
  const { data, error } = await insforge.functions.invoke<AskResponse>("ask", {
    body: { question, match_count: matchCount },
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
