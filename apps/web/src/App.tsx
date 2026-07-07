import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { makeApiUrl, uploadPresentation } from "./api";
import { type GestureCommand, useGestureController } from "./useGestureController";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function commandLabel(command: string): string {
  const map: Record<string, string> = {
    goto_1: "Jump to slide 1",
    goto_2: "Jump to slide 2",
    goto_3: "Jump to slide 3",
    goto_4: "Jump to slide 4",
    prev: "Previous slide",
    next: "Next slide",
    none: "No command yet",
  };
  return map[command] ?? command;
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  const canMove = pageCount > 0;

  const goToPage = useCallback(
    (page: number) => {
      if (!pageCount) return;
      setPageNumber(Math.min(Math.max(page, 1), pageCount));
    },
    [pageCount],
  );

  const nextPage = useCallback(() => {
    setPageNumber((page) => Math.min(page + 1, pageCount || 1));
  }, [pageCount]);

  const previousPage = useCallback(() => {
    setPageNumber((page) => Math.max(page - 1, 1));
  }, []);

  const handleCommand = useCallback(
    (command: GestureCommand) => {
      if (command === "goto_1") goToPage(1);
      if (command === "goto_2") goToPage(2);
      if (command === "goto_3") goToPage(3);
      if (command === "goto_4") goToPage(4);
      if (command === "prev") previousPage();
      if (command === "next") nextPage();
    },
    [goToPage, nextPage, previousPage],
  );

  const gestureState = useGestureController({
    videoRef,
    enabled: cameraEnabled,
    onCommand: handleCommand,
  });

  async function handleUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadPresentation(file);
      setPdfUrl(makeApiUrl(result.pdf_url));
      setFileName(result.original_filename);
      setPageNumber(1);
      setPageCount(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setUploading(false);
    }
  }

  async function startCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraEnabled(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraEnabled(false);
  }

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "PageUp") previousPage();
      if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") nextPage();
      if (/^[1-9]$/.test(event.key)) goToPage(Number(event.key));
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [goToPage, nextPage, previousPage]);

  useEffect(() => stopCamera, []);

  const slideStatus = useMemo(() => {
    if (!pageCount) return "No deck loaded";
    return `${pageNumber} / ${pageCount}`;
  }, [pageCount, pageNumber]);

  return (
    <main className="app-shell">
      <section className="sidebar">
        <div>
          <p className="eyebrow">GestureDeck MVP</p>
          <h1>Camera-controlled web PPT player</h1>
          <p className="muted">
            Upload a PPT/PPTX/PDF, convert it to PDF on the API server, then control slides with your hand.
          </p>
        </div>

        <label className="upload-card">
          <input
            type="file"
            accept=".ppt,.pptx,.odp,.pdf,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            onChange={(event) => void handleUpload(event.target.files?.[0])}
          />
          <span>{uploading ? "Uploading and converting..." : "Upload presentation"}</span>
        </label>

        {fileName && <p className="file-name">Loaded: {fileName}</p>}
        {error && <pre className="error-box">{error}</pre>}

        <div className="controls">
          <button disabled={!canMove || pageNumber <= 1} onClick={previousPage}>Previous</button>
          <button disabled={!canMove || pageNumber >= pageCount} onClick={nextPage}>Next</button>
          <button disabled={!canMove} onClick={() => goToPage(1)}>1</button>
          <button disabled={!canMove} onClick={() => goToPage(2)}>2</button>
          <button disabled={!canMove} onClick={() => goToPage(3)}>3</button>
          <button disabled={!canMove} onClick={() => goToPage(4)}>4</button>
        </div>

        <div className="camera-panel">
          <video ref={videoRef} playsInline muted className="camera-preview" />
          <div className="camera-actions">
            {!cameraEnabled ? (
              <button onClick={() => void startCamera()}>Start camera gestures</button>
            ) : (
              <button onClick={stopCamera}>Stop camera</button>
            )}
          </div>
          <dl>
            <div><dt>Status</dt><dd>{gestureState.status}</dd></div>
            <div><dt>Detected</dt><dd>{gestureState.lastGesture}</dd></div>
            <div><dt>Command</dt><dd>{commandLabel(gestureState.lastCommand)}</dd></div>
          </dl>
        </div>
      </section>

      <section className="stage">
        <header className="stage-header">
          <span>{slideStatus}</span>
          <span>Keyboard: ← →, PageUp/PageDown, 1-9</span>
        </header>

        <div className="deck-canvas">
          {!pdfUrl ? (
            <div className="empty-state">
              <h2>Upload a presentation to begin</h2>
              <p>PPT/PPTX files are converted by LibreOffice. PDFs are displayed directly.</p>
            </div>
          ) : (
            <Document
              file={pdfUrl}
              loading={<div className="empty-state">Loading PDF...</div>}
              error={<div className="empty-state">Could not load the converted PDF.</div>}
              onLoadSuccess={({ numPages }) => setPageCount(numPages)}
            >
              <Page pageNumber={pageNumber} width={Math.min(window.innerWidth - 420, 1100)} />
            </Document>
          )}
        </div>
      </section>
    </main>
  );
}
