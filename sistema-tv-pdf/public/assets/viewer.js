const pages = document.querySelector('#pdf-pages');
const status = document.querySelector('#viewer-status');
let pdf;
let rendering = false;
let resizePending = false;
let renderedWidth = 0;

function showError() {
  status.textContent = 'No pudimos cargar la propuesta. Puedes usar el botón Descargar PDF de arriba.';
  status.classList.add('error');
  status.setAttribute('role', 'alert');
  pages.setAttribute('aria-busy', 'false');
}

async function renderPages() {
  if (rendering) { resizePending = true; return; }
  rendering = true;
  pages.setAttribute('aria-busy', 'true');
  try {
    const width = pages.clientWidth;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      let figure = pages.querySelector(`[data-page="${number}"]`);
      if (!figure) {
        figure = document.createElement('figure');
        figure.className = 'pdf-page';
        figure.dataset.page = String(number);
        const caption = document.createElement('figcaption');
        caption.id = `pagina-${number}`;
        caption.textContent = `Página ${number} de ${pdf.numPages}`;
        figure.setAttribute('aria-labelledby', caption.id);
        const surface = document.createElement('div');
        surface.className = 'page-surface';
        const accessibleText = document.createElement('div');
        accessibleText.className = 'sr-only';
        const content = await page.getTextContent();
        accessibleText.textContent = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('');
        figure.append(caption, surface, accessibleText);
        pages.append(figure);
      }
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      const density = Math.min(devicePixelRatio || 1, 2, Math.sqrt(6000000 / (viewport.width * viewport.height)));
      canvas.width = Math.ceil(viewport.width * density);
      canvas.height = Math.ceil(viewport.height * density);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport,
        transform: [density, 0, 0, density, 0, 0] }).promise;
      const surface = figure.querySelector('.page-surface');
      surface.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      surface.replaceChildren(canvas);
      figure.dataset.rendered = 'true';
      status.textContent = `${number} de ${pdf.numPages} páginas listas para leer.`;
    }
    renderedWidth = width;
    pages.setAttribute('aria-busy', 'false');
  } catch {
    showError();
  } finally {
    rendering = false;
    if (resizePending) { resizePending = false; if (Math.abs(pages.clientWidth - renderedWidth) > 1) void renderPages(); }
  }
}

async function loadProposal() {
  try {
    const { getDocument, GlobalWorkerOptions } = await import('/assets/vendor/pdfjs-6.3.289/pdf.min.mjs');
    GlobalWorkerOptions.workerSrc = '/assets/vendor/pdfjs-6.3.289/pdf.worker.min.mjs';
    const response = await fetch('/assets/document.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Document unavailable');
    const documentInfo = await response.json();
    pdf = await getDocument({ url: documentInfo.url, isEvalSupported: false, useWasm: false,
      standardFontDataUrl: '/assets/vendor/pdfjs-6.3.289/standard_fonts/' }).promise;
    if (pdf.numPages !== documentInfo.pages) throw new Error('Unexpected page count');
    await renderPages();
    let resizeTimer;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (Math.abs(pages.clientWidth - renderedWidth) > 1) void renderPages();
      }, 220);
    });
    observer.observe(pages);
  } catch {
    showError();
  }
}

void loadProposal();
