const PDFJS_MODULE_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER_URL = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

let pdfLibraryPromise;
const documentCache = new WeakMap();

async function getPdfLibrary() {
  if (!pdfLibraryPromise) {
    pdfLibraryPromise = import(PDFJS_MODULE_URL).then((library) => {
      library.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
      return library;
    });
  }
  return pdfLibraryPromise;
}

async function getPdfDocument(blob) {
  if (!documentCache.has(blob)) {
    documentCache.set(blob, (async () => {
      const library = await getPdfLibrary();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return library.getDocument({ data: bytes }).promise;
    })());
  }
  return documentCache.get(blob);
}

function selectedRangeWithin(selection, container) {
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const text = selection.toString().replace(/\s+/g, " ").trim();
  if (!text) return null;
  return { range, text };
}

export async function mountSelectablePdf({ blob, pageNumber = 1, zoom = 1, onPageReady, onTextSelected }) {
  const root = document.getElementById("legalPdfViewer");
  const scroll = document.getElementById("legalPdfScroll");
  const stage = document.getElementById("legalPdfPage");
  const canvas = document.getElementById("legalPdfCanvas");
  const textLayerElement = document.getElementById("legalPdfTextLayer");
  const loading = document.getElementById("legalPdfLoading");
  if (!root || !scroll || !stage || !canvas || !textLayerElement || !blob) return;

  try {
    const [library, pdfDocument] = await Promise.all([getPdfLibrary(), getPdfDocument(blob)]);
    if (!root.isConnected) return;
    const safePage = Math.min(pdfDocument.numPages, Math.max(1, Number(pageNumber || 1)));
    const page = await pdfDocument.getPage(safePage);
    const baseViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(320, scroll.clientWidth - 40);
    const fitScale = Math.min(2.25, Math.max(.55, availableWidth / baseViewport.width));
    const viewport = page.getViewport({ scale: fitScale * Math.min(2.5, Math.max(.65, Number(zoom || 1))) });
    const outputScale = Math.min(2, window.devicePixelRatio || 1);
    const context = canvas.getContext("2d", { alpha: false });

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    stage.style.width = `${Math.floor(viewport.width)}px`;
    stage.style.height = `${Math.floor(viewport.height)}px`;
    textLayerElement.style.setProperty("--scale-factor", String(viewport.scale));

    await page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;

    textLayerElement.replaceChildren();
    const textLayer = new library.TextLayer({
      textContentSource: await page.getTextContent(),
      container: textLayerElement,
      viewport
    });
    await textLayer.render();
    if (!root.isConnected) return;
    loading?.remove();
    root.classList.add("is-ready");
    onPageReady?.({ pageNumber: safePage, pageCount: pdfDocument.numPages });

    const detectSelection = () => {
      window.setTimeout(() => {
        const selected = selectedRangeWithin(window.getSelection(), textLayerElement);
        if (!selected) return;
        const selectionRect = selected.range.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        onTextSelected?.({
          text: selected.text.slice(0, 1000),
          pageNumber: safePage,
          left: Math.max(12, Math.min(rootRect.width - 220, selectionRect.left - rootRect.left + selectionRect.width / 2 - 105)),
          top: Math.max(54, selectionRect.top - rootRect.top - 48)
        });
      }, 0);
    };
    textLayerElement.addEventListener("mouseup", detectSelection);
    textLayerElement.addEventListener("keyup", detectSelection);
  } catch (error) {
    if (loading) loading.innerHTML = `<strong>PDF preview could not be rendered.</strong><span>${String(error?.message || error)}</span>`;
    throw error;
  }
}
