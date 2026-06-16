'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
  serveUrl: string;      // /api/files/serve/:token
  fileName: string;
  studentName: string;
  studentEmail: string;
}

export default function SecurePdfViewer({ serveUrl, fileName, studentName, studentEmail }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const renderTask  = useRef<any>(null);
  const pdfRef      = useRef<any>(null);

  const [numPages,     setNumPages]     = useState(0);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [scale,        setScale]        = useState(1.3);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [fullscreen,   setFullscreen]   = useState(false);
  const containerRef  = useRef<HTMLDivElement>(null);

  // ── Block right-click / keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const noCtx  = (e: MouseEvent)    => e.preventDefault();
    const noKeys = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (['s','p','c','a','u','j'].includes(e.key.toLowerCase())) e.preventDefault();
      }
      if (e.key === 'PrintScreen') e.preventDefault();
    };
    document.addEventListener('contextmenu', noCtx);
    document.addEventListener('keydown',     noKeys);
    return () => {
      document.removeEventListener('contextmenu', noCtx);
      document.removeEventListener('keydown',     noKeys);
    };
  }, []);

  // ── Load PDF ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!serveUrl) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError('');

        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const loadingTask = pdfjsLib.getDocument({ url: serveUrl, withCredentials: false });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load PDF');
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [serveUrl]);

  // ── Render page to canvas + draw watermark ────────────────────────────────
  const renderPage = useCallback(async (pageNum: number, scaleVal: number) => {
    if (!pdfRef.current || !canvasRef.current) return;

    if (renderTask.current) {
      renderTask.current.cancel();
      renderTask.current = null;
    }

    const page     = await pdfRef.current.getPage(pageNum);
    const viewport = page.getViewport({ scale: scaleVal });
    const canvas   = canvasRef.current;
    const ctx      = canvas.getContext('2d')!;

    canvas.height = viewport.height;
    canvas.width  = viewport.width;

    const task = page.render({ canvasContext: ctx, viewport });
    renderTask.current = task;

    try {
      await task.promise;
    } catch (e: any) {
      if (e?.name === 'RenderingCancelledException') return;
      throw e;
    }

    // Draw tiled watermark over the entire page
    ctx.save();
    ctx.globalAlpha  = 0.10;
    ctx.fillStyle    = '#1e293b';
    ctx.font         = `bold ${Math.max(12, scaleVal * 11)}px Arial`;
    ctx.textAlign    = 'left';

    const mark   = `${studentName}  •  ${studentEmail}`;
    const tw     = ctx.measureText(mark).width;
    const rowH   = 90 * scaleVal;
    const colW   = tw + 60;

    for (let y = -canvas.height; y < canvas.height * 2; y += rowH) {
      for (let x = -canvas.width; x < canvas.width * 2; x += colW) {
        ctx.save();
        ctx.translate(x + colW / 2, y + rowH / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.fillText(mark, -tw / 2, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }, [studentName, studentEmail]);

  useEffect(() => {
    if (!loading && pdfRef.current) {
      renderPage(currentPage, scale);
    }
  }, [currentPage, scale, loading, renderPage]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const prevPage = () => setCurrentPage(p => Math.max(1, p - 1));
  const nextPage = () => setCurrentPage(p => Math.min(numPages, p + 1));
  const zoomIn   = () => setScale(s => Math.min(3, parseFloat((s + 0.2).toFixed(1))));
  const zoomOut  = () => setScale(s => Math.max(0.5, parseFloat((s - 0.2).toFixed(1))));

  const toggleFullscreen = () => {
    if (!fullscreen) {
      containerRef.current?.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-3">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-gray-600 font-medium">Could not load PDF</p>
        <p className="text-gray-400 text-sm mt-1">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-gray-800 rounded-2xl overflow-hidden shadow-xl select-none"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 border-b border-gray-700 flex-wrap">
        {/* File name */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-bold bg-red-600 text-white px-2 py-0.5 rounded uppercase flex-shrink-0">PDF</span>
          <span className="text-xs text-gray-300 truncate">{fileName}</span>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1 || loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white transition-colors"
            title="Previous page"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs text-gray-300 w-20 text-center">
            {loading ? '…' : `${currentPage} / ${numPages}`}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= numPages || loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white transition-colors"
            title="Next page"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5 || loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white transition-colors"
            title="Zoom out"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <span className="text-xs text-gray-300 w-12 text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3 || loading}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-30 text-white transition-colors"
            title="Zoom in"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>
        </div>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
          title="Fullscreen"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {fullscreen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            }
          </svg>
        </button>

        {/* Protected badge */}
        <div className="flex items-center gap-1 px-2 py-1 bg-emerald-900/50 border border-emerald-700/50 rounded-lg">
          <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span className="text-[10px] text-emerald-400 font-semibold">Protected</span>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div className="flex-1 overflow-auto bg-gray-700 flex justify-center p-4" style={{ minHeight: '65vh' }}>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Loading PDF…</p>
          </div>
        ) : (
          <div className="relative shadow-2xl" style={{ display: 'inline-block' }}>
            <canvas
              ref={canvasRef}
              className="block max-w-full"
              style={{ imageRendering: 'auto' }}
            />
          </div>
        )}
      </div>

      {/* ── Footer: page jump ── */}
      {!loading && numPages > 1 && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 bg-gray-900 border-t border-gray-700">
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage}
            onChange={e => {
              const v = parseInt(e.target.value);
              if (v >= 1 && v <= numPages) setCurrentPage(v);
            }}
            className="w-14 text-center text-xs bg-gray-700 text-white border border-gray-600 rounded-lg px-2 py-1 focus:outline-none focus:border-primary-500"
          />
          <span className="text-xs text-gray-500">of {numPages} pages</span>
        </div>
      )}
    </div>
  );
}
