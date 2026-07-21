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

function normalizedSelectionRects(range, stage) {
  const stageRect = stage.getBoundingClientRect();
  if (!stageRect.width || !stageRect.height) return [];
  const rounded = (value) => Number(value.toFixed(6));
  return Array.from(range.getClientRects())
    .filter((rect) => rect.width > 1 && rect.height > 1)
    .map((rect) => ({
      x: rounded(Math.max(0, Math.min(1, (rect.left - stageRect.left) / stageRect.width))),
      y: rounded(Math.max(0, Math.min(1, (rect.top - stageRect.top) / stageRect.height))),
      width: rounded(Math.max(0, Math.min(1, rect.width / stageRect.width))),
      height: rounded(Math.max(0, Math.min(1, rect.height / stageRect.height)))
    }))
    .slice(0, 40);
}

function storedHighlightRects(highlight, textLayerElement, stage) {
  try {
    const parsed = JSON.parse(String(highlight?.body || ""));
    if (Array.isArray(parsed?.rects) && parsed.rects.length) return parsed.rects;
  } catch {}

  // Compatibility for highlights created before geometric positions were saved.
  const quote = String(highlight?.quoted_text || "").trim();
  if (!quote) return [];
  const needle = quote.toLocaleLowerCase();
  const stageRect = stage.getBoundingClientRect();
  for (const span of textLayerElement.querySelectorAll("span")) {
    const value = String(span.textContent || "");
    const index = value.toLocaleLowerCase().indexOf(needle);
    const node = span.firstChild;
    if (index < 0 || !node || node.nodeType !== Node.TEXT_NODE) continue;
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, Math.min(value.length, index + quote.length));
    return Array.from(range.getClientRects()).map((rect) => ({
      x: (rect.left - stageRect.left) / stageRect.width,
      y: (rect.top - stageRect.top) / stageRect.height,
      width: rect.width / stageRect.width,
      height: rect.height / stageRect.height
    }));
  }
  return [];
}

function renderStoredHighlights(highlightLayer, highlights, textLayerElement, stage) {
  highlightLayer.replaceChildren();
  highlights.forEach((highlight) => {
    storedHighlightRects(highlight, textLayerElement, stage).forEach((rect) => {
      const mark = document.createElement("span");
      mark.className = "lap-pdf-persisted-highlight";
      mark.title = `Highlighted by ${highlight.author_name || "authorised reviewer"}`;
      mark.style.setProperty("--highlight-color", highlight.color || "#ffe45c");
      mark.style.left = `${Number(rect.x || 0) * 100}%`;
      mark.style.top = `${Number(rect.y || 0) * 100}%`;
      mark.style.width = `${Number(rect.width || 0) * 100}%`;
      mark.style.height = `${Number(rect.height || 0) * 100}%`;
      highlightLayer.append(mark);
    });
  });
}

export async function mountSelectablePdf({ blob, pageNumber = 1, zoom = 1, highlights = [], onPageReady, onTextSelected }) {
  const root = document.getElementById("legalPdfViewer");
  const scroll = document.getElementById("legalPdfScroll");
  const pages = document.getElementById("legalPdfPages");
  const loading = document.getElementById("legalPdfLoading");
  if (!root || !scroll || !pages || !blob) return;

  try {
    const [library, pdfDocument] = await Promise.all([getPdfLibrary(), getPdfDocument(blob)]);
    if (!root.isConnected) return;
    const safePage = Math.min(pdfDocument.numPages, Math.max(1, Number(pageNumber || 1)));
    const firstPage = await pdfDocument.getPage(1);
    const baseViewport = firstPage.getViewport({ scale: 1 });
    const availableWidth = Math.max(320, scroll.clientWidth - 40);
    const availableHeight = Math.max(320, scroll.clientHeight - 40);
    const fitScale = Math.min(2.25, Math.max(.35, Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height)));
    const scale = fitScale * Math.min(2.5, Math.max(.65, Number(zoom || 1)));
    const shellViewport = firstPage.getViewport({ scale });
    const shellWidth = Math.floor(shellViewport.width);
    const shellHeight = Math.floor(shellViewport.height);
    const fragment = document.createDocumentFragment();

    for (let number = 1; number <= pdfDocument.numPages; number += 1) {
      const stage = document.createElement("section");
      stage.className = "lap-pdf-page";
      stage.dataset.pageNumber = String(number);
      stage.style.width = `${shellWidth}px`;
      stage.style.height = `${shellHeight}px`;
      stage.innerHTML = `<canvas></canvas><div class="lap-pdf-highlight-layer" aria-hidden="true"></div><div class="lap-pdf-text-layer"></div><div class="lap-pdf-page-loading"><strong>Page ${number}</strong><span>Loading…</span></div>`;
      fragment.append(stage);
    }
    pages.replaceChildren(fragment);
    loading?.remove();
    root.classList.add("is-ready");
    onPageReady?.({ pageNumber: safePage, pageCount: pdfDocument.numPages });

    const outputScale = Math.min(2, window.devicePixelRatio || 1);
    const bufferedPages = new Set();
    const unloadPage = (stage) => {
      if (stage.dataset.renderState !== "ready") return;
      const canvas = stage.querySelector("canvas");
      canvas.width = 1;
      canvas.height = 1;
      stage.querySelector(".lap-pdf-text-layer")?.replaceChildren();
      stage.querySelector(".lap-pdf-highlight-layer")?.replaceChildren();
      if (!stage.querySelector(".lap-pdf-page-loading")) {
        const placeholder = document.createElement("div");
        placeholder.className = "lap-pdf-page-loading";
        placeholder.innerHTML = `<strong>Page ${stage.dataset.pageNumber}</strong><span>Scroll nearby to load…</span>`;
        stage.append(placeholder);
      }
      delete stage.dataset.renderState;
    };
    const renderPage = async (stage) => {
      if (!root.isConnected || stage.dataset.renderState) return;
      stage.dataset.renderState = "loading";
      const number = Number(stage.dataset.pageNumber);
      try {
        const page = await pdfDocument.getPage(number);
        const viewport = page.getViewport({ scale });
        const canvas = stage.querySelector("canvas");
        const textLayerElement = stage.querySelector(".lap-pdf-text-layer");
        const highlightLayer = stage.querySelector(".lap-pdf-highlight-layer");
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
        const textLayer = new library.TextLayer({ textContentSource: await page.getTextContent(), container: textLayerElement, viewport });
        await textLayer.render();
        renderStoredHighlights(highlightLayer, highlights.filter((row) => Number(row.page_number) === number), textLayerElement, stage);
        const detectSelection = () => {
          window.setTimeout(() => {
            const selected = selectedRangeWithin(window.getSelection(), textLayerElement);
            if (!selected) return;
            const selectionRect = selected.range.getBoundingClientRect();
            const rootRect = root.getBoundingClientRect();
            onTextSelected?.({
              text: selected.text.slice(0, 1000),
              pageNumber: number,
              rects: normalizedSelectionRects(selected.range, stage),
              left: Math.max(12, Math.min(rootRect.width - 250, selectionRect.left - rootRect.left + selectionRect.width / 2 - 120)),
              top: Math.max(54, selectionRect.top - rootRect.top - 48)
            });
          }, 0);
        };
        textLayerElement.addEventListener("mouseup", detectSelection);
        textLayerElement.addEventListener("keyup", detectSelection);
        stage.dataset.renderState = "ready";
        stage.querySelector(".lap-pdf-page-loading")?.remove();
        if (!bufferedPages.has(stage)) unloadPage(stage);
      } catch (error) {
        stage.dataset.renderState = "error";
        const pageLoading = stage.querySelector(".lap-pdf-page-loading");
        if (pageLoading) pageLoading.innerHTML = `<strong>Page ${number} could not be rendered.</strong><span>${String(error?.message || error)}</span>`;
      }
    };

    const observer = new IntersectionObserver((entries) => {
      if (!root.isConnected) {
        observer.disconnect();
        return;
      }
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          bufferedPages.add(entry.target);
          renderPage(entry.target);
        } else {
          bufferedPages.delete(entry.target);
          unloadPage(entry.target);
        }
      });
    }, { root: scroll, rootMargin: "900px 0px", threshold: .01 });
    pages.querySelectorAll(".lap-pdf-page").forEach((stage) => observer.observe(stage));

    let scrollFrame = 0;
    const updateCurrentPage = () => {
      scrollFrame = 0;
      if (!root.isConnected) return;
      const scrollRect = scroll.getBoundingClientRect();
      const readingLine = scrollRect.top + Math.min(scrollRect.height * .3, 240);
      let closestPage = safePage;
      let closestDistance = Number.POSITIVE_INFINITY;
      pages.querySelectorAll(".lap-pdf-page").forEach((stage) => {
        const rect = stage.getBoundingClientRect();
        const distance = readingLine < rect.top ? rect.top - readingLine : readingLine > rect.bottom ? readingLine - rect.bottom : 0;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = Number(stage.dataset.pageNumber);
        }
      });
      onPageReady?.({ pageNumber: closestPage, pageCount: pdfDocument.numPages });
    };
    scroll.addEventListener("scroll", () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(updateCurrentPage);
    }, { passive: true });

    window.requestAnimationFrame(() => {
      const target = pages.querySelector(`[data-page-number="${safePage}"]`);
      if (target) scroll.scrollTop = Math.max(0, target.offsetTop - 12);
      updateCurrentPage();
    });
  } catch (error) {
    if (loading) loading.innerHTML = `<strong>PDF preview could not be rendered.</strong><span>${String(error?.message || error)}</span>`;
    throw error;
  }
}
