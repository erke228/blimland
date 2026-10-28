'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Minus,
  Plus,
} from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Material } from '@/lib/materials';

function PdfPages({ src, title }: { src: string; title: string }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(600);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;
    setError(false);
    setBusy(true);
    setDocument(undefined);
    setPage(1);
    import('pdfjs-dist')
      .then(async (pdfjs) => {
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = '/document-runtime/pdf.worker.min.mjs';
        const task = pdfjs.getDocument({
          url: src,
          withCredentials: true,
          cMapUrl: '/document-runtime/cmaps/',
          cMapPacked: true,
          standardFontDataUrl: '/document-runtime/standard_fonts/',
          wasmUrl: '/document-runtime/wasm/',
        });
        destroy = () => {
          void task.destroy();
        };
        const pdf = await task.promise;
        if (!disposed) setDocument(pdf);
      })
      .catch(() => {
        if (!disposed) {
          setError(true);
          setBusy(false);
        }
      });
    return () => {
      disposed = true;
      destroy?.();
    };
  }, [src]);
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(Math.max(200, entries[0].contentRect.width - 28)),
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let disposed = false;
    let render: RenderTask | undefined;
    setBusy(true);
    setError(false);
    (async () => {
      const pdfPage = await document.getPage(page);
      if (disposed || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = (Math.min(width, 1000) / base.width) * zoom;
      const viewport = pdfPage.getViewport({ scale });
      const pixelRatio = Math.min(
        window.devicePixelRatio || 1,
        2,
        4096 / viewport.width,
        8192 / viewport.height,
        Math.sqrt(16000000 / (viewport.width * viewport.height)),
      );
      const node = canvas.current;
      node.width = Math.floor(viewport.width * pixelRatio);
      node.height = Math.floor(viewport.height * pixelRatio);
      node.style.width = `${viewport.width}px`;
      node.style.height = `${viewport.height}px`;
      render = pdfPage.render({
        canvas: node,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      await render.promise;
      const content = await pdfPage.getTextContent();
      if (!disposed) {
        setText(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
        setBusy(false);
      }
    })().catch((err) => {
      if (!disposed && err?.name !== 'RenderingCancelledException') {
        setError(true);
        setBusy(false);
      }
    });
    return () => {
      disposed = true;
      render?.cancel();
    };
  }, [document, page, width, zoom]);
  return (
    <div className="pdf-reader">
      <div className="pdf-toolbar">
        <div className="pdf-pager">
          <button
            type="button"
            aria-label="Алдыңғы бет"
            disabled={!document || page === 1 || busy}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <label>
            <span className="pdf-page-word">Бет</span>{' '}
            <select
              aria-label="Бет нөмірі"
              value={page}
              disabled={!document || busy}
              onChange={(e) => setPage(Number(e.target.value))}
            >
              {Array.from({ length: document?.numPages || 1 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
            <span>/ {document?.numPages || '…'}</span>
          </label>
          <button
            type="button"
            aria-label="Келесі бет"
            disabled={!document || page === document.numPages || busy}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="pdf-zoom">
          <button
            type="button"
            aria-label="Кішірейту"
            disabled={zoom <= 0.75 || busy}
            onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
          >
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="Үлкейту"
            disabled={zoom >= 2 || busy}
            onClick={() => setZoom(Math.min(2, zoom + 0.25))}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
      {busy && (
        <p className="document-status" role="status">
          Бет жүктелуде…
        </p>
      )}
      {error && (
        <p className="notice error" role="alert">
          Құжатты көрсету мүмкін болмады. Түпнұсқаны бөлек ашыңыз немесе жүктеп алыңыз.
        </p>
      )}
      <div className="pdf-page-scroll" ref={container} aria-busy={busy}>
        <canvas ref={canvas} aria-label={`${title}, ${page}-бет`} role="img" />
      </div>
      {text && (
        <details className="pdf-text">
          <summary>Бет мәтіні</summary>
          <p>{text}</p>
        </details>
      )}
    </div>
  );
}
export function DocumentMaterials({ materials }: { materials: Material[] }) {
  const [selected, setSelected] = useState(materials[0]?.id);
  const material = materials.find((m) => m.id === selected) || materials[0];
  if (!material) return null;
  const src = `/materials/${material.id}/file`;
  return (
    <section className="lesson-documents" aria-label="Дәріс материалдары">
      <div className="document-section-title">
        <FileText size={20} />
        <h2>Дәріс материалдары</h2>
      </div>
      {materials.length > 1 && (
        <div className="document-tabs">
          {materials.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={material.id === item.id}
              onClick={() => setSelected(item.id)}
            >
              {item.kind.toUpperCase()} · {item.original_name}
            </button>
          ))}
        </div>
      )}
      <div className="document-frame">
        <div className="document-heading">
          <div>
            <strong>{material.original_name}</strong>
            <small>
              {material.kind.toUpperCase()} · {(material.size_bytes / 1024 / 1024).toFixed(1)} МБ
              {material.page_count ? ` · ${material.page_count} бет` : ''}
            </small>
          </div>
          <div className="document-links">
            {material.kind === 'pdf' && (
              <a href={src} target="_blank" rel="noopener noreferrer" aria-label="PDF бөлек ашу">
                <ExternalLink size={17} />
              </a>
            )}
            <a href={`${src}?download=1`} aria-label="Түпнұсқаны жүктеп алу">
              <Download size={17} />
            </a>
          </div>
        </div>
        {material.kind === 'pdf' ? (
          <PdfPages key={material.id} src={src} title={material.original_name} />
        ) : (
          <>
            <p className="docx-format-note">
              Оқуға арналған Word көрінісі. Бет орналасуы түпнұсқадан өзгеше болуы мүмкін.
            </p>
            {!!material.preview_warning && (
              <p className="docx-format-note">
                Құжаттың кейбір элементтері толық көрсетілмеуі мүмкін. Түпнұсқаны да тексеріңіз.
              </p>
            )}
            <iframe
              key={material.id}
              title={material.original_name}
              src={`/materials/${material.id}/preview`}
              sandbox=""
              className="docx-reader"
            />
          </>
        )}
      </div>
    </section>
  );
}
