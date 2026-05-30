"use client";

import { useRef, useState, useCallback } from "react";

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type SelectedFile = {
  file:    File;
  preview: string | null; // object URL para imágenes, null para el resto
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileIcon(mime: string) {
  if (mime.startsWith("image/"))          return "🖼";
  if (mime === "application/pdf")         return "📕";
  if (mime.includes("word"))              return "📄";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "📊";
  if (mime.includes("zip"))               return "🗜";
  return "📄";
}

function formatBytes(bytes: number) {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function FileUpload({
  value,
  onChange,
  disabled,
}: {
  value:    SelectedFile[];
  onChange: (files: SelectedFile[]) => void;
  disabled?: boolean;
}) {
  const inputRef               = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      setError(null);
      const arr = Array.from(incoming);
      const toAdd: SelectedFile[] = [];

      for (const f of arr) {
        if (f.size > 10 * 1024 * 1024) {
          setError(`"${f.name}" supera el límite de 10 MB`);
          continue;
        }
        toAdd.push({
          file:    f,
          preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        });
      }

      onChange([...value, ...toAdd]);
    },
    [value, onChange],
  );

  const remove = (idx: number) => {
    const next = [...value];
    const prev = next[idx].preview;
    if (prev) URL.revokeObjectURL(prev);
    next.splice(idx, 1);
    onChange(next);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      {/* Zona de drop */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`
          cursor-pointer border-2 border-dashed rounded-xl px-4 py-5 text-center transition-colors select-none
          ${dragging ? "border-blue-500 bg-blue-950/30" : "border-slate-700 hover:border-slate-500"}
          ${disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
          className="hidden"
          disabled={disabled}
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <p className="text-slate-400 text-sm">📎 Arrastra archivos aquí o haz clic para seleccionar</p>
        <p className="text-slate-600 text-xs mt-1">PNG · JPG · PDF · DOCX · XLSX · TXT · Máx. 10 MB por archivo</p>
      </div>

      {/* Error de validación */}
      {error && (
        <p className="text-red-400 text-xs">{error}</p>
      )}

      {/* Chips de archivos seleccionados */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((sf, i) => (
            <div key={i}
              className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 max-w-xs">
              {sf.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sf.preview} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
              ) : (
                <span className="text-lg flex-shrink-0">{fileIcon(sf.file.type)}</span>
              )}
              <div className="min-w-0">
                <p className="text-slate-200 text-xs font-medium truncate">{sf.file.name}</p>
                <p className="text-slate-500 text-xs">{formatBytes(sf.file.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-slate-500 hover:text-slate-300 flex-shrink-0 ml-1 text-sm leading-none">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Helper para subir archivos al servidor ────────────────────────────────────

export async function uploadFiles(
  files:    SelectedFile[],
  ticketId: string,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;

  for (const sf of files) {
    try {
      const fd = new FormData();
      fd.append("file",     sf.file);
      fd.append("ticketId", ticketId);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) ok++;
      else        failed++;
    } catch {
      failed++;
    }
  }

  return { ok, failed };
}
