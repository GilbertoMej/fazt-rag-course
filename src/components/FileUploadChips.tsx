import { useState, useRef, useCallback } from "react";
import { Paperclip, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { ingestText } from "../lib/rag";

const ACCEPTED_EXT = [
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".html",
  ".css",
  ".xml",
  ".yml",
  ".yaml",
];

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB per file

type ChipStatus = "pending" | "uploading" | "done" | "error";

interface UploadChip {
  id: string;
  name: string;
  size: number;
  status: ChipStatus;
  chunks?: number;
  error?: string;
  file: File;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileUploadChips() {
  const [chips, setChips] = useState<UploadChip[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateChip = (id: string, patch: Partial<UploadChip>) => {
    setChips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const removeChip = (id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
  };

  const uploadChip = useCallback(async (chip: UploadChip) => {
    updateChip(chip.id, { status: "uploading" });
    try {
      const text = await chip.file.text();
      if (!text.trim()) {
        updateChip(chip.id, { status: "error", error: "Archivo vacío" });
        return;
      }
      const res = await ingestText(text, chip.name);
      updateChip(chip.id, { status: "done", chunks: res.chunks });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al subir";
      updateChip(chip.id, { status: "error", error: msg });
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      const accepted: File[] = [];
      const rejected: string[] = [];
      for (const f of Array.from(files)) {
        const okExt = ACCEPTED_EXT.some((ext) =>
          f.name.toLowerCase().endsWith(ext),
        );
        const okSize = f.size <= MAX_BYTES;
        if (okExt && okSize) accepted.push(f);
        else rejected.push(f.name);
      }

      const newChips: UploadChip[] = accepted.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        status: "pending",
        file,
      }));
      if (newChips.length > 0) {
        setChips((prev) => [...prev, ...newChips]);
      }
      if (rejected.length > 0) {
        // simple signal — surface a synthetic error chip so the user sees what was dropped
        const rejChips: UploadChip[] = rejected.map((n) => ({
          id: `rej-${n}-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          name: n,
          size: 0,
          status: "error",
          error: "Tipo o tamaño no permitido (≤5MB, texto plano)",
          file: new File([], n),
        }));
        setChips((prev) => [...prev, ...rejChips]);
      }
      // sequential upload to avoid hammering the gateway
      for (const chip of newChips) {
        await uploadChip(chip);
      }
    },
    [uploadChip],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    e.target.value = "";
  };

  const hasActive = chips.some(
    (c) => c.status === "pending" || c.status === "uploading",
  );
  const settledCount = chips.filter(
    (c) => c.status === "done" || c.status === "error",
  ).length;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXT.join(",")}
        onChange={handleChange}
        className="upload__input"
        aria-label="Seleccionar archivos"
      />
      <button
        type="button"
        className="chat__icon-btn"
        aria-label="Adjuntar archivos"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={18} aria-hidden="true" />
      </button>
      {chips.length > 0 && (
        <div className="upload__bar" role="region" aria-label="Archivos a subir">
          <div className="upload__chips">
            {chips.map((chip) => (
              <span
                key={chip.id}
                className={`upload__chip upload__chip--${chip.status}`}
              >
                {chip.status === "uploading" && (
                  <Loader2 size={12} className="upload__spin" aria-hidden="true" />
                )}
                {chip.status === "done" && (
                  <CheckCircle2 size={12} aria-hidden="true" />
                )}
                {chip.status === "error" && (
                  <AlertCircle size={12} aria-hidden="true" />
                )}
                <span className="upload__chip-name">{chip.name}</span>
                <span className="upload__chip-meta">
                  {chip.status === "done" && chip.chunks != null
                    ? `${chip.chunks} chunks`
                    : chip.status === "error"
                      ? (chip.error ?? "error")
                      : fmtSize(chip.size)}
                </span>
                <button
                  type="button"
                  className="upload__chip-remove"
                  onClick={() => removeChip(chip.id)}
                  disabled={chip.status === "uploading"}
                  aria-label={`Quitar ${chip.name}`}
                >
                  <X size={11} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
          <div className="upload__actions">
            <button
              type="button"
              className="upload__add"
              onClick={() => inputRef.current?.click()}
              disabled={hasActive}
              aria-label="Añadir más archivos"
            >
              <Paperclip size={14} aria-hidden="true" />
              <span>Añadir</span>
            </button>
            {settledCount > 0 && !hasActive && (
              <button
                type="button"
                className="upload__clear"
                onClick={() => setChips([])}
                aria-label="Limpiar lista"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
