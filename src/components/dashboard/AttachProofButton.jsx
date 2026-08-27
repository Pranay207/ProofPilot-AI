import React, { useEffect, useRef, useState } from "react";
import { UploadCloud, CheckCircle2 } from "lucide-react";

export default function AttachProofButton({ onUploaded, disabled }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUploading(true);
    setProgress(0);
    setDone(false);
  };

  useEffect(() => {
    if (!uploading) return;
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(id);
          setUploading(false);
          setDone(true);
          const name = fileName;
          setTimeout(() => {
            setDone(false);
            onUploaded?.(name);
          }, 400);
          return 100;
        }
        return p + 14;
      });
    }, 95);
    return () => clearInterval(id);
  }, [uploading, fileName, onUploaded]);

  return (
    <div className="flex items-center gap-2">
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
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          Attach proof
        </button>
      )}
    </div>
  );
}