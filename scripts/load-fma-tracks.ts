/**
 * Bulk-load FMA tracks.csv into public.fma_tracks via COPY FROM STDIN.
 *
 * Usage:
 *   npx tsx scripts/load-fma-tracks.ts <path-to-tracks.csv>
 *
 * Reads the connection string from `npx @insforge/cli db connection-string`.
 *
 * FMA header is 2 rows: row 1 = category (album/artist/set/track), row 2 =
 * field name. We flatten to `<category>_<col>` keys so column collisions in
 * album/artist/set/track (id/title/comments/favorites/tags) don't clash.
 */

import { Client } from "pg";
import copyFrom from "pg-copy-streams";
import { execSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";

const CATEGORY_PREFIX: Record<string, string> = {
  album: "album",
  artist: "artist",
  set: "set",
  track: "track",
};

function parseArgs(): { connStr: string; csvPath: string } {
  const csvPath = resolve(process.argv[2] ?? "");
  if (!csvPath) {
    console.error("Uso: npx tsx scripts/load-fma-tracks.ts <path-to-tracks.csv>");
    process.exit(1);
  }
  const connStr = execSync("npx -y @insforge/cli db connection-string", {
    encoding: "utf8",
  }).trim();
  return { connStr, csvPath };
}

function csvEscape(v: string): string {
  if (
    v.includes(",") ||
    v.includes('"') ||
    v.includes("\n") ||
    v.includes("\r")
  ) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

async function main() {
  const { connStr, csvPath } = parseArgs();
  const client = new Client({ connectionString: connStr });
  await client.connect();
  console.log(`Conectado. Cargando ${csvPath}`);

  const parser = createReadStream(csvPath, { encoding: "utf8" }).pipe(
    parse({
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
      bom: true,
    }),
  );

  let categories: string[] = [];
  let columnNames: string[] = [];
  let rowCount = 0;
  let copyStream: NodeJS.WritableStream | null = null;

  await client.query("BEGIN");

  for await (const row of parser as AsyncIterable<string[]>) {
    if (categories.length === 0) {
      categories = row;
      continue;
    }
    if (columnNames.length === 0) {
      for (let i = 1; i < row.length; i++) {
        const cat = (categories[i] ?? "track").trim();
        const prefix = CATEGORY_PREFIX[cat] ?? cat;
        columnNames.push(`${prefix}_${row[i].trim()}`);
      }
      console.log(`Columnas detectadas: ${columnNames.length}`);
      const allCols = ["track_id", ...columnNames];
      copyStream = client.query(
        copyFrom.from(
          `COPY public.fma_tracks (${allCols.join(", ")}) FROM STDIN WITH (FORMAT csv)`,
        ),
      );
      copyStream.on("error", (err: Error) => {
        console.error("Error en COPY:", err);
        process.exit(1);
      });
      continue;
    }

    // Data row. row[0] = track_id, row[1..] maps to columnNames.
    const trackId = csvEscape(row[0] ?? "");
    const cells: string[] = new Array(columnNames.length);
    for (let i = 0; i < columnNames.length; i++) {
      const v = row[i + 1] ?? "";
      cells[i] = v === "" ? "" : csvEscape(v);
    }
    const line = [trackId, ...cells].join(",") + "\n";
    const ok = copyStream!.write(line);
    if (!ok) {
      await new Promise<void>((r) => copyStream!.once("drain", () => r()));
    }
    rowCount++;
    if (rowCount % 50000 === 0) {
      console.log(`  ${rowCount.toLocaleString()} filas…`);
    }
  }

  if (copyStream) {
    await new Promise<void>((res, rej) => {
      copyStream!.end(() => res());
      copyStream!.on("error", rej);
    });
  }

  await client.query("COMMIT");
  console.log(`Listo: ${rowCount.toLocaleString()} filas insertadas.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
