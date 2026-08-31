import React, { useRef, useState } from "react";
import { UploadCloud, CheckCircle2, AlertCircle } from "lucide-react";

export default function AttachProofButton({ onUploaded, disabled, label = "Attach proof", compact = false }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const readAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read evidence file"));
    reader.readAsDataURL(file);
  });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Max 5 MB");
      e.target.value = "";
      return;
    }
    setFileName(file.name);
    setUploading(true);
    setProgress(15);
    setDone(false);
    try {
      const contentBase64 = await readAsDataUrl(file);
      setProgress(60);
      await onUploaded?.({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        contentBase64,
      });
      setProgress(100);
      setDone(true);
      setTimeout(() => setDone(false), 900);
    } catch (uploadError) {
      setError(uploadError?.message || "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2 min-h-8">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFile}
        accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.txt"
      />
      {uploading ? (
        <div className="flex items-center gap-2 min-w-[160px]">
          <span className="text-[11px] text-slate-400 truncate max-w-[110px]" title={fileName}>{fileName}</span>
          <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[11px] text-slate-500 tabular-nums w-8 text-right">{progress}%</span>
        </div>
      ) : done ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" /> Uploaded
        </span>
      ) : error ? (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600" title={error}>
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </span>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className={compact
            ? "inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            : "inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"}
        >
          <UploadCloud className="w-3.5 h-3.5" />
          {label}
        </button>
      )}
    </div>
  );
}
