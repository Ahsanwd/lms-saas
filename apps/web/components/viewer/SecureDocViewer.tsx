'use client';

import { useEffect, useRef } from 'react';

interface Props {
  html: string;
  fileName: string;
  mimeType: string;
  studentName: string;
  studentEmail: string;
}

const MIME_LABELS: Record<string, { label: string; color: string }> = {
  'application/msword':                                                                { label: 'DOC',  color: 'bg-blue-600' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':          { label: 'DOCX', color: 'bg-blue-600' },
  'application/vnd.ms-excel':                                                          { label: 'XLS',  color: 'bg-green-600' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':                { label: 'XLSX', color: 'bg-green-600' },
  'text/plain':                                                                         { label: 'TXT',  color: 'bg-gray-600' },
};

export default function SecureDocViewer({ html, fileName, mimeType, studentName, studentEmail }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Block right-click, copy, print shortcuts ──────────────────────────────
  useEffect(() => {
    const noCtx  = (e: MouseEvent)    => e.preventDefault();
    const noCopy = (e: ClipboardEvent) => e.preventDefault();
    const noKeys = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (['s', 'p', 'c', 'a', 'u'].includes(e.key.toLowerCase())) e.preventDefault();
      }
    };
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('contextmenu', noCtx);
    el.addEventListener('copy',        noCopy);
    document.addEventListener('keydown', noKeys);
    return () => {
      el.removeEventListener('contextmenu', noCtx);
      el.removeEventListener('copy',        noCopy);
      document.removeEventListener('keydown', noKeys);
    };
  }, []);

  const meta = MIME_LABELS[mimeType] ?? { label: 'FILE', color: 'bg-gray-600' };
  const isExcel = mimeType.includes('excel') || mimeType.includes('spreadsheet');
  const watermark = `${studentName}  •  ${studentEmail}`;

  return (
    <div className="flex flex-col rounded-2xl overflow-hidden border border-gray-200 shadow-xl select-none bg-white"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <span className={`text-xs font-bold text-white px-2 py-0.5 rounded uppercase flex-shrink-0 ${meta.color}`}>
          {meta.label}
        </span>
        <span className="text-sm text-gray-700 font-medium truncate flex-1">{fileName}</span>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-200 rounded-lg flex-shrink-0">
          <svg className="w-3 h-3 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-[10px] text-emerald-700 font-semibold">Protected</span>
        </div>
      </div>

      {/* ── Content area with watermark overlay ── */}
      <div
        ref={containerRef}
        className="relative overflow-auto"
        style={{ minHeight: '65vh', maxHeight: '75vh' }}
      >
        {/* Tiled CSS watermark — purely visual, sits on top of content */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          style={{
            backgroundImage: `repeating-linear-gradient(
              -25deg,
              transparent,
              transparent 80px,
              rgba(0,0,0,0) 80px,
              rgba(0,0,0,0) 120px
            )`,
          }}
        >
          {Array.from({ length: 40 }).map((_, i) => (
            <div
              key={i}
              className="absolute whitespace-nowrap text-gray-400 font-semibold opacity-[0.07]"
              style={{
                fontSize: '13px',
                top:  `${(i % 10) * 120 - 40}px`,
                left: `${Math.floor(i / 10) * 280 - 60}px`,
                transform: 'rotate(-20deg)',
                letterSpacing: '0.05em',
              }}
            >
              {watermark}
            </div>
          ))}
        </div>

        {/* Document HTML */}
        <div
          className={`relative z-0 p-6 ${isExcel ? 'lms-excel-doc' : 'lms-word-doc'}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {/* ── Styles injected for Word/Excel content ── */}
      <style>{`
        .lms-word-doc {
          font-family: 'Segoe UI', Georgia, serif;
          font-size: 14px;
          line-height: 1.8;
          color: #1e293b;
          max-width: 800px;
          margin: 0 auto;
        }
        .lms-word-doc h1 { font-size: 1.6em; font-weight: 700; margin: 1em 0 0.4em; }
        .lms-word-doc h2 { font-size: 1.3em; font-weight: 600; margin: 0.9em 0 0.3em; }
        .lms-word-doc h3 { font-size: 1.1em; font-weight: 600; margin: 0.7em 0 0.2em; }
        .lms-word-doc p  { margin: 0.5em 0; }
        .lms-word-doc table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .lms-word-doc td, .lms-word-doc th { border: 1px solid #e2e8f0; padding: 6px 10px; }
        .lms-word-doc th { background: #f8fafc; font-weight: 600; }
        .lms-word-doc ul, .lms-word-doc ol { padding-left: 1.6em; margin: 0.5em 0; }
        .lms-word-doc strong { font-weight: 700; }
        .lms-word-doc em { font-style: italic; }

        .lms-excel-doc { overflow-x: auto; }
        .lms-excel-doc .lms-sheet-name {
          font-weight: 700; font-size: 12px; color: #475569;
          text-transform: uppercase; letter-spacing: 0.05em;
          padding: 8px 0 4px; border-bottom: 2px solid #e2e8f0; margin-bottom: 8px;
        }
        .lms-excel-doc .lms-sheet { margin-bottom: 24px; }
        .lms-excel-doc table { border-collapse: collapse; font-size: 13px; min-width: 100%; }
        .lms-excel-doc td, .lms-excel-doc th {
          border: 1px solid #cbd5e1; padding: 4px 8px;
          white-space: nowrap; min-width: 60px;
        }
        .lms-excel-doc tr:nth-child(even) td { background: #f8fafc; }
        .lms-excel-doc tr:first-child td { background: #1e40af; color: white; font-weight: 600; }
        .lms-excel-workbook { padding: 4px; }
      `}</style>
    </div>
  );
}
