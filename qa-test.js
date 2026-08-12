const fs = require('fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const JSZip = require('jszip');
const XLSX = require('xlsx');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { TextEncoder, TextDecoder } = require('util');
const { webcrypto } = require('crypto');

async function makePdf(label, pages = 1) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`${label} / page ${i + 1}`, { x: 60, y: 720, size: 18, font });
  }
  return Buffer.from(await doc.save());
}

async function makePackage() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Current Project Specifications Index'],
    ['Spec Number', 'Specification', 'Discipline', 'Rev', 'Date'],
    ['01_23_45_67', 'General requirements', 'General', 'A', '2026-08-01'],
    ['23_11_13_00 (54321)', 'Facility fuel piping', 'Mechanical', '2', '2026-08-02'],
    ['45_99_99_99', 'Missing manufacturing spec', 'Process', '0', '2026-08-03'],
    ['not-a-spec', 'Malformed index row', 'QA', '0', '2026-08-04'],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Specifications');
  const workbook = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const repeatedResourcePdf = await makePdf('Repeated source resource');
  const entries = [
    ['Demo/Current Project Specifications Index.xlsx', workbook],
    ['Demo/DIVISION 01 - General Requirements/01_23_45_67 (12345) General.pdf', await makePdf('General requirements', 2)],
    ['Demo/DIVISION 23 - HVAC/23_11_13_00 (54321) r1 Fuel Piping.pdf', await makePdf('Older fuel piping revision')],
    ['Demo/DIVISION 23 - HVAC/23_11_13_00 (99999) r3 Fuel Piping.pdf', await makePdf('Selected highest fuel piping revision')],
    ['Demo/DIVISION 23 - HVAC/23_11_13_00 DAT r99.pdf', await makePdf('DAT must never win')],
    ['Demo/DIVISION 23 - HVAC/23_11_13_00 app r100.pdf', await makePdf('APP must never win')],
    ['Demo/DIVISION 01 - General Requirements/01_23_45_67 - Package 12345.pdf', await makePdf('Hyphenated filename package')],
    ['Demo/DIVISION 23 - HVAC/Package-54321/23_11_13_00 (54321) Wrapped.pdf', await makePdf('Hyphenated subfolder package')],
    ['Demo/DIVISION 02 - Existing Conditions/02_02_02_02 Extra.pdf', repeatedResourcePdf],
    ['Demo/DIVISION 04 - Masonry/04_04_04_04 Repeated.pdf', repeatedResourcePdf],
    ['Demo/DIVISION 03 - Concrete/Read Me First.pdf', await makePdf('Uncoded extra')],
  ].map(([path, bytes]) => ({ path, bytes }));
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.path, entry.bytes);
  return { workbook, entries, zip: await zip.generateAsync({ type: 'nodebuffer' }) };
}

async function waitFor(test, label, timeout = 15000) {
  const started = Date.now();
  while (!test()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function makeDirectoryHandle(window, entries, rootName = 'Demo') {
  const root = { kind: 'directory', name: rootName, children: new Map() };
  for (const entry of entries) {
    const parts = entry.path.split('/');
    if (parts[0] === rootName) parts.shift();
    let directory = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!directory.children.has(parts[i])) directory.children.set(parts[i], { kind: 'directory', name: parts[i], children: new Map() });
      directory = directory.children.get(parts[i]);
    }
    const name = parts.at(-1);
    directory.children.set(name, {
      kind: 'file',
      name,
      async getFile() {
        return {
          name,
          size: entry.bytes.length,
          type: /\.pdf$/i.test(name) ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          arrayBuffer: async () => new window.Uint8Array(entry.bytes).buffer,
        };
      },
    });
  }
  const attachIterator = directory => {
    directory.values = async function* values() { yield* directory.children.values(); };
    for (const child of directory.children.values()) if (child.kind === 'directory') attachIterator(child);
  };
  attachIterator(root);
  return root;
}

(async () => {
  const captured = [];
  const downloadNames = [];
  const errors = [];
  const vc = new VirtualConsole();
  vc.sendTo(console, { omitJSDOMErrors: true });
  vc.on('jsdomError', error => {
    if (!/navigation/i.test(error.message)) errors.push(error);
  });
  vc.on('error', error => errors.push(error));
  const dom = new JSDOM(fs.readFileSync('Spec_Navigator.html', 'utf8'), {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://local.spec-navigator.test/#qa',
    virtualConsole: vc,
    beforeParse(window) {
      window.TextEncoder = TextEncoder;
      window.TextDecoder = TextDecoder;
      window.crypto = webcrypto;
      window.URL.createObjectURL = blob => { captured.push(blob); return `blob:test-${captured.length}`; };
      window.URL.revokeObjectURL = () => {};
      window.HTMLAnchorElement.prototype.click = function click() { downloadNames.push(this.download); };
    },
  });
  const pkg = await makePackage();
  Object.defineProperty(dom.window, 'isSecureContext', { configurable: true, value: true });
  dom.window.showDirectoryPicker = async () => makeDirectoryHandle(dom.window, pkg.entries);
  dom.window.document.getElementById('folderButton').click();
  await waitFor(() => dom.window.document.getElementById('progressLabel').textContent === 'Package reconciliation complete', 'dedicated folder picker reconciliation');
  const qa = dom.window.__SPEC_NAVIGATOR_QA__;
  if (qa.parseFilenameRevision('Spec R12 final.pdf') !== 12 || qa.parseFilenameRevision('Spec without revision.pdf') !== null) throw new Error('Filename r# parsing failed');
  if (!qa.hasDatOrApp('SPEC_DAT_R99.PDF') || !qa.hasDatOrApp('spec_app_r100.pdf')) throw new Error('DAT/APP filename filtering failed');
  const values = ['statIndex', 'statMatched', 'statExtra', 'statMissing', 'statSkipped'].map(id => dom.window.document.getElementById(id).textContent);
  if (values.join(',') !== '4,2,3,2,5') throw new Error(`Unexpected reconciliation stats: ${values.join(',')}`);
  const statusText = dom.window.document.getElementById('packageStatus').textContent;
  for (const expected of ['2 hyphen', '2 DAT/APP', '1 older/duplicate revision']) if (!statusText.includes(expected)) throw new Error(`Exclusion summary missing: ${expected}`);
  const matchedText = dom.window.document.getElementById('divisionList').textContent;
  if (!matchedText.includes('01_23_45_67') || !matchedText.includes('23_11_13_00')) throw new Error('Matched table did not render expected specs');
  if (!matchedText.includes('Folder only · included') || !matchedText.includes('Index matched')) throw new Error('Compilation manifest did not clearly label both included groups');
  if (!matchedText.includes('r3 Fuel Piping') || matchedText.includes('r1 Fuel Piping') || matchedText.includes('DAT r99') || matchedText.includes('app r100')) throw new Error('Highest-revision selection or DAT/APP exclusion failed in the compilation manifest');

  dom.window.document.getElementById('buildButton').click();
  await waitFor(() => captured.length === 1, 'PDF download', 30000);
  const outputBytes = await new Promise((resolve, reject) => {
    const reader = new dom.window.FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(captured[0]);
  });
  fs.mkdirSync('tmp/pdfs', { recursive: true });
  fs.writeFileSync('tmp/pdfs/spec-navigator-qa.pdf', outputBytes);
  const output = await PDFDocument.load(outputBytes);
  if (output.getPageCount() !== 7) throw new Error(`Expected 7 output pages, got ${output.getPageCount()}`);
  const annots = output.getPage(0).node.Annots();
  if (!annots || annots.size() !== 5) throw new Error(`Expected 5 clickable TOC annotations, got ${annots?.size() || 0}`);
  const { PDFDict, PDFArray, PDFName } = require('pdf-lib');
  const tocRef = output.getPage(0).ref.tag;
  const backlinkYs = new Set();
  for (let pageIndex = 1; pageIndex < output.getPageCount(); pageIndex++) {
    const pageAnnots = output.getPage(pageIndex).node.Annots();
    if (!pageAnnots || pageAnnots.size() !== 1) throw new Error(`Expected one TOC backlink on source page ${pageIndex + 1}`);
    const annotation = output.context.lookup(pageAnnots.get(0), PDFDict);
    const destination = annotation.lookup(PDFName.of('Dest'), PDFArray);
    if (destination.get(0).tag !== tocRef || destination.get(1).toString() !== '/XYZ') throw new Error(`Source page ${pageIndex + 1} backlink does not target the exact TOC location`);
    backlinkYs.add(destination.get(3).toString());
  }
  if (backlinkYs.size !== 5) throw new Error(`Expected five distinct TOC row return targets, got ${backlinkYs.size}`);

  await waitFor(() => dom.window.document.getElementById('buildButton').disabled === false, 'PDF build cleanup');
  dom.window.document.getElementById('exportManifestButton').click();
  await waitFor(() => captured.length === 2, 'audit CSV download');
  const auditCsv = await new Promise((resolve, reject) => {
    const reader = new dom.window.FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(captured[1]);
  });
  for (const status of ['Index matched','Folder only','Index not found','Hyphenated package','DAT/APP variant','Superseded revision']) {
    if (!auditCsv.includes(status)) throw new Error(`Audit CSV is missing status: ${status}`);
  }
  if (/0 duplicate streams/.test(dom.window.document.getElementById('packageStatus').textContent)) throw new Error('Lossless duplicate resource removal did not activate');

  if (qa.compareVersions('1.1.0','1.0.9') !== 1 || qa.compareVersions('1.0.0','1.0.0') !== 0 || qa.compareVersions('0.9.9','1.0.0') !== -1) throw new Error('Semantic version comparison failed');
  let foreignUpdateRejected = false;
  try { qa.normalizeUpdateManifest({version:'9.0.0',downloadUrl:'https://example.com/Spec_Navigator.html'}); } catch { foreignUpdateRejected = true; }
  if (!foreignUpdateRejected) throw new Error('Update manifest accepted an untrusted download host');
  const fakePackagedApp = `<!doctype html><html><head><title>Spec Navigator v1.1.0</title></head><body>${'updated application '.repeat(7000)}</body></html>`;
  dom.window.fetch = async url => {
    if (!String(url).startsWith('https://raw.githubusercontent.com/noahfgarrett/Spec-Navigator/')) throw new Error(`Unexpected update URL: ${url}`);
    return { ok:true, status:200, arrayBuffer:async () => new TextEncoder().encode(fakePackagedApp).buffer };
  };
  qa.setUpdateInfoForTest({
    version:'1.1.0', publishedAt:'2026-08-13T12:00:00Z', filename:'Spec_Navigator_v1.1.0.html',
    downloadUrl:'https://raw.githubusercontent.com/noahfgarrett/Spec-Navigator/main/Spec_Navigator_v1.1.0.html',
    notes:['Scoped search polish','Faster update downloads']
  });
  await qa.openUpdateDialogForTest('update');
  if (dom.window.document.getElementById('versionUpdateDot').hidden || !dom.window.document.getElementById('updateDialog').open) throw new Error('Available update did not surface on the version button and modal');
  dom.window.document.getElementById('downloadUpdateButton').click();
  await waitFor(() => qa.updaterSnapshot().downloaded && captured.length === 3, 'full packaged HTML update download');
  const downloadedUpdate = await new Promise((resolve, reject) => {
    const reader = new dom.window.FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(captured[2]);
  });
  if (downloadedUpdate !== fakePackagedApp) throw new Error('Update flow did not download the full packaged HTML bytes');
  if (downloadNames.at(-1) !== 'Spec_Navigator_v1.1.0.html') throw new Error(`Update download filename was not versioned: ${downloadNames.at(-1)}`);
  dom.window.document.getElementById('updateDialogClose').click();

  dom.window.HTMLCanvasElement.prototype.getContext = () => ({});
  const fakePdfDocument = {
    numPages: 12,
    async getPage(pageNumber) {
      return {
        getViewport({ scale }) { return { width: 612 * scale, height: 792 * scale, transform:[scale,0,0,-scale,0,792*scale] }; },
        render() { return { promise: Promise.resolve(), cancel() {} }; },
        getTextContent() { return Promise.resolve({ items: [{ str: pageNumber === 3 ? 'Needle is first and needle is second. Banana sits nearby.' : pageNumber === 8 ? 'Needle specification text includes banana.' : `page ${pageNumber} ordinary text`, width:310, height:12, transform:[12,0,0,12,72,700] }] }); },
      };
    },
  };
  let activePdfDocuments = 0;
  let maxActivePdfDocuments = 0;
  dom.window.pdfjsLib = {
    GlobalWorkerOptions: {},
    Util: { transform(a,b) { return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]; } },
    getDocument() {
      activePdfDocuments++;
      maxActivePdfDocuments = Math.max(maxActivePdfDocuments, activePdfDocuments);
      let destroyed = false;
      return { promise: Promise.resolve(fakePdfDocument), destroy() { if (!destroyed) { destroyed = true; activePdfDocuments--; } return Promise.resolve(); } };
    },
  };
  dom.window.document.getElementById('openViewerButton').click();
  await waitFor(() => dom.window.document.getElementById('viewerPageCount').textContent === '12', 'virtualized viewer document');
  await waitFor(() => qa.viewerSnapshot().rendered.length === 3, 'initial three-page render window');
  let viewerSnapshot = qa.viewerSnapshot();
  if (viewerSnapshot.canvases !== 3 || viewerSnapshot.rendered.join(',') !== '0,1,2') throw new Error(`Unexpected initial viewer render window: ${JSON.stringify(viewerSnapshot)}`);
  if (viewerSnapshot.focusedMaxCanvasPixels !== 32000000 || viewerSnapshot.bufferMaxCanvasPixels !== 12000000 || viewerSnapshot.focusedPixelRatio !== 3 || viewerSnapshot.bufferPixelRatio !== 2) throw new Error(`Viewer sharp-render defaults are incorrect: ${JSON.stringify(viewerSnapshot)}`);
  if (viewerSnapshot.renderRoles['0'] !== 'focused' || viewerSnapshot.renderRoles['1'] !== 'buffer' || viewerSnapshot.renderRoles['2'] !== 'buffer') throw new Error(`Viewer did not prioritize the focused page: ${JSON.stringify(viewerSnapshot)}`);
  const documentSearch = dom.window.document.getElementById('viewerDocSearch');
  documentSearch.value = 'needle; banana';
  dom.window.document.getElementById('viewerFind').click();
  await waitFor(() => qa.viewerSnapshot().textMatches.length === 5, 'multi-term occurrence search');
  await waitFor(() => dom.window.document.querySelectorAll('.viewer-highlight').length === 3, 'all visible occurrence highlights');
  if (dom.window.document.querySelectorAll('.viewer-highlight.active').length !== 1) throw new Error('Search did not show exactly one active green highlight');
  const firstActiveResult = dom.window.document.querySelector('.viewer-highlight.active').dataset.searchResultIndex;
  dom.window.document.getElementById('viewerFindNext').click();
  await waitFor(() => dom.window.document.querySelector('.viewer-highlight.active')?.dataset.searchResultIndex !== firstActiveResult, 'green highlight occurrence advancement');
  if (qa.viewerSnapshot().currentPage !== 2) throw new Error('Occurrence navigation left a page before cycling through its on-page matches');
  dom.window.document.getElementById('viewerSearchSummary').click();
  if (dom.window.document.getElementById('viewerSearchSummaryModal').hidden || dom.window.document.querySelectorAll('.search-result-row').length !== 5) throw new Error('Search summary did not list every occurrence');
  if (!dom.window.document.getElementById('viewerSearchSummaryBody').textContent.includes('Needle is first and needle is second.')) throw new Error('Search summary did not retain sentence context');
  const repeatedNeedleMark = dom.window.document.querySelectorAll('.search-result-row')[1].querySelector('mark');
  if (!repeatedNeedleMark || !repeatedNeedleMark.previousSibling?.textContent.includes('Needle is first and ')) throw new Error('Search summary did not emphasize the specifically numbered repeated occurrence');
  dom.window.document.getElementById('viewerSearchSummaryClose').click();
  if (dom.window.getComputedStyle(dom.window.document.getElementById('viewerViewport')).overflowY !== 'scroll') throw new Error('Viewer document scrollbar is not persistent');
  dom.window.document.getElementById('viewerNavToggle').click();
  if (!dom.window.document.getElementById('viewerDialog').classList.contains('sidebar-collapsed')) throw new Error('Desktop contents toggle did not collapse the sidebar');
  dom.window.document.getElementById('viewerNavToggle').click();
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'+',ctrlKey:true,bubbles:true}));
  if (qa.viewerSnapshot().zoom !== 1.25) throw new Error(`Keyboard zoom did not use a 25% increment: ${qa.viewerSnapshot().zoom}`);
  dom.window.document.getElementById('viewerZoomOut').click();
  if (qa.viewerSnapshot().zoom !== 1) throw new Error(`Zoom button did not use a 25% increment: ${qa.viewerSnapshot().zoom}`);
  const wheelPage = dom.window.document.querySelector('.viewer-page-slot[data-page="3"]');
  const wheelViewport = dom.window.document.getElementById('viewerViewport');
  const wheelRect = () => {
    const width = parseFloat(wheelPage.style.width) || 612;
    const height = parseFloat(wheelPage.style.height) || 792;
    const top = (parseFloat(wheelPage.style.top) || 0) - wheelViewport.scrollTop;
    return {left:100,top,right:100+width,bottom:top+height,width,height,x:100,y:top,toJSON(){return this;}};
  };
  wheelPage.getBoundingClientRect = wheelRect;
  wheelViewport.getBoundingClientRect = () => ({left:0,top:0,right:1000,bottom:700,width:1000,height:700,x:0,y:0,toJSON(){return this;}});
  const backgroundWheel = new dom.window.WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true,clientX:10,clientY:10});
  wheelViewport.dispatchEvent(backgroundWheel);
  if (!backgroundWheel.defaultPrevented || qa.viewerSnapshot().zoom !== 1) throw new Error('Ctrl-wheel was not safely contained while the cursor was outside a PDF page');
  const scrollBeforeWheelZoom = {left:wheelViewport.scrollLeft,top:wheelViewport.scrollTop};
  const canvasBeforeWheelZoom = wheelPage.querySelector('canvas');
  const belowFitWheel = new dom.window.WheelEvent('wheel',{deltaY:100,ctrlKey:true,bubbles:true,cancelable:true,clientX:300,clientY:300});
  wheelPage.dispatchEvent(belowFitWheel);
  if (!belowFitWheel.defaultPrevented || qa.viewerSnapshot().zoom !== .95 || qa.viewerSnapshot().pagesWidth !== 1000) throw new Error(`Wheel zoom did not remain stable below fit width: ${JSON.stringify(qa.viewerSnapshot())}`);
  const fitWheel = new dom.window.WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true,clientX:300,clientY:300});
  wheelPage.dispatchEvent(fitWheel);
  if (!fitWheel.defaultPrevented || qa.viewerSnapshot().zoom !== 1 || qa.viewerSnapshot().pagesWidth !== 1000) throw new Error(`Wheel zoom jolted at fit width: ${JSON.stringify(qa.viewerSnapshot())}`);
  const pageWheel = new dom.window.WheelEvent('wheel',{deltaY:-100,ctrlKey:true,bubbles:true,cancelable:true,clientX:300,clientY:300});
  wheelPage.dispatchEvent(pageWheel);
  if (!pageWheel.defaultPrevented || qa.viewerSnapshot().zoom !== 1.05 || qa.viewerSnapshot().pagesWidth <= 1000) throw new Error(`Cursor-over-page Ctrl-wheel did not cross fit width in a 5% increment: ${JSON.stringify(qa.viewerSnapshot())}`);
  if (!qa.viewerSnapshot().wheelZooming || wheelPage.querySelector('canvas') !== canvasBeforeWheelZoom) throw new Error('Wheel zoom replaced the visible page before the gesture settled');
  if (wheelViewport.scrollLeft === scrollBeforeWheelZoom.left && wheelViewport.scrollTop === scrollBeforeWheelZoom.top) throw new Error('Ctrl-wheel zoom did not compensate scroll position to preserve the cursor anchor');
  await waitFor(() => !qa.viewerSnapshot().wheelZooming && qa.viewerSnapshot().rendered.length >= 3, 'settled wheel zoom rerender');
  dom.window.document.getElementById('viewerFindNext').click();
  dom.window.document.getElementById('viewerFindNext').click();
  dom.window.document.getElementById('viewerFindNext').click();
  await waitFor(() => qa.viewerSnapshot().rendered.join(',') === '5,6,7,8,9', 'text search page navigation');

  const allSpecsToggle = dom.window.document.getElementById('viewerSearchAll');
  allSpecsToggle.checked = true;
  allSpecsToggle.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  documentSearch.value = 'needle';
  dom.window.document.getElementById('viewerFind').click();
  await waitFor(() => !qa.viewerSnapshot().searchingAll && qa.viewerSnapshot().textMatches.length === 15, 'all-spec sequential occurrence search');
  if (maxActivePdfDocuments > 2 || activePdfDocuments !== 1) throw new Error(`All-spec search did not keep PDF loading bounded: max ${maxActivePdfDocuments}, active ${activePdfDocuments}`);
  if (!dom.window.document.getElementById('viewerFindStatus').textContent.includes('of 15')) throw new Error('All-spec results did not expose cross-document occurrence navigation');
  dom.window.document.getElementById('viewerScopeButton').click();
  const scopeInput = (group,predicate) => [...dom.window.document.querySelectorAll(`[data-viewer-scope-group="${group}"]`)].find(input => predicate(input.dataset.viewerScopeKey));
  const scopeKeys = group => [...dom.window.document.querySelectorAll(`[data-viewer-scope-group="${group}"]`)].map(input => input.dataset.viewerScopeKey);
  const division01Scope = scopeInput('divisions',key => key.startsWith('1|'));
  if (!division01Scope) throw new Error('Search scope did not expose Division 01');
  division01Scope.checked = true;
  division01Scope.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  if (qa.viewerSnapshot().scopeMode !== 'and' || qa.viewerSnapshot().scopedItems !== 1) throw new Error(`AND scope did not select Division 01: ${JSON.stringify(qa.viewerSnapshot())}`);
  if (scopeKeys('disciplines').join(',') !== 'general' || scopeKeys('sections').join(',') !== '01_23' || scopeKeys('sources').join(',') !== 'index') throw new Error(`AND facets did not cascade to compatible choices: ${JSON.stringify({disciplines:scopeKeys('disciplines'),sections:scopeKeys('sections'),sources:scopeKeys('sources')})}`);
  dom.window.document.getElementById('viewerScopeClear').click();
  const division23Scope = scopeInput('divisions',key => key.startsWith('23|'));
  if (!division23Scope) throw new Error('Search scope did not expose Division 23 after clearing the cascade');
  division23Scope.checked = true;
  division23Scope.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  const mechanicalScope = scopeInput('disciplines',key => key === 'mechanical');
  const section2311Scope = scopeInput('sections',key => key === '23_11');
  if (!mechanicalScope || !section2311Scope || scopeKeys('disciplines').length !== 1) throw new Error('Division 23 did not cascade to its compatible discipline and XX_XX section');
  mechanicalScope.checked = true;
  mechanicalScope.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  if (qa.viewerSnapshot().scopedItems !== 1 || qa.viewerSnapshot().scopeFilterCount !== 2) throw new Error(`Cross-category search scope did not narrow with AND behavior: ${JSON.stringify(qa.viewerSnapshot())}`);
  dom.window.document.getElementById('viewerFind').click();
  await waitFor(() => !qa.viewerSnapshot().searchingAll && qa.viewerSnapshot().textMatches.length === 3, 'division and discipline scoped search');
  await waitFor(() => qa.viewerSnapshot().selectedIndex === 4 && qa.viewerSnapshot().pages === 12 && qa.viewerSnapshot().rendered.length >= 3, 'scoped search target document');
  dom.window.document.getElementById('viewerSearchSummary').click();
  const scopedSummary = dom.window.document.getElementById('viewerSearchSummarySub').textContent;
  if (!scopedSummary.includes('DIVISION 23') || !scopedSummary.includes('Mechanical')) throw new Error(`Search summary did not identify its applied scope: ${scopedSummary}`);
  dom.window.document.getElementById('viewerSearchSummaryClose').click();
  dom.window.document.getElementById('viewerFindNext').click();
  dom.window.document.getElementById('viewerFindNext').click();
  await waitFor(() => qa.viewerSnapshot().currentPage === 7 && qa.viewerSnapshot().rendered.join(',') === '5,6,7,8,9', 'scoped occurrence navigation');
  dom.window.document.getElementById('viewerScopeClear').click();
  if (qa.viewerSnapshot().scopedItems !== 5 || qa.viewerSnapshot().scopeFilterCount !== 0) throw new Error('Clear filters did not restore all included specifications');
  const orMode = dom.window.document.getElementById('viewerScopeModeOr');
  orMode.checked = true;
  orMode.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  const orDivision01 = scopeInput('divisions',key => key.startsWith('1|'));
  orDivision01.checked = true;
  orDivision01.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  const orMechanical = scopeInput('disciplines',key => key === 'mechanical');
  if (!orMechanical || scopeKeys('disciplines').length < 3) throw new Error('OR mode incorrectly removed unrelated scope choices');
  orMechanical.checked = true;
  orMechanical.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  if (qa.viewerSnapshot().scopeMode !== 'or' || qa.viewerSnapshot().scopedItems !== 2 || qa.viewerSnapshot().scopeFilterCount !== 2) throw new Error(`OR scope did not union selected categories: ${JSON.stringify(qa.viewerSnapshot())}`);
  dom.window.document.getElementById('viewerFind').click();
  await waitFor(() => !qa.viewerSnapshot().searchingAll && qa.viewerSnapshot().textMatches.length === 6, 'OR-union scoped search');
  if (qa.viewerSnapshot().lastSearchSpecCount !== 2 || !qa.viewerSnapshot().lastSearchScopeLabel.startsWith('OR ·')) throw new Error(`OR search did not retain its union scope summary: ${JSON.stringify(qa.viewerSnapshot())}`);
  dom.window.document.getElementById('viewerScopeClear').click();
  allSpecsToggle.checked = false;
  allSpecsToggle.dispatchEvent(new dom.window.Event('change', { bubbles:true }));
  qa.expandViewerItemsForTest(500);
  viewerSnapshot = qa.viewerSnapshot();
  if (viewerSnapshot.items !== 500 || viewerSnapshot.navDomRows >= 100 || viewerSnapshot.navDomRows >= viewerSnapshot.navRows) throw new Error(`Viewer table of contents was not virtualized: ${JSON.stringify(viewerSnapshot)}`);
  viewerSnapshot = qa.viewerSnapshot();
  if (viewerSnapshot.canvases !== 5 || viewerSnapshot.rendered.includes(0)) throw new Error(`Viewer did not evict distant canvases: ${JSON.stringify(viewerSnapshot)}`);
  if (viewerSnapshot.renderRoles['7'] !== 'focused') throw new Error(`Viewer did not promote the newly focused page to high resolution: ${JSON.stringify(viewerSnapshot)}`);
  dom.window.document.getElementById('viewerReviewPackage').click();
  if (dom.window.document.getElementById('viewerDialog').hasAttribute('open')) throw new Error('Review package did not return from the viewer to the reconciliation screen');

  if (errors.length) throw errors[0];
  console.log('Dedicated folder selection: PASS');
  console.log('Hyphenated package exclusion: PASS (filename and nested-folder cases)');
  console.log('DAT/APP exclusion: PASS (case-insensitive and applied before revision selection)');
  console.log('Highest r# selection: PASS (r3 selected over r1; r99/r100 variants excluded)');
  console.log('Synthetic package reconciliation: PASS (4 index rows, 2 matches, 2 index exceptions, 3 folder-only PDFs)');
  console.log('Full audit CSV: PASS (matched, folder-only, missing, and all exclusion reasons)');
  console.log('Merged searchable PDF: PASS (1 TOC + all 6 eligible source pages)');
  console.log('Forward and exact-row return links: PASS (5 specs, 6 source pages)');
  console.log('Lossless stream deduplication: PASS');
  console.log('In-app Spec Viewer: PASS (virtualized 500-spec contents, opt-in all-spec sequential search, bounded PDF loading, five-page canvas window, distant canvas eviction)');
  console.log('Viewer-first workflow: PASS (review package returns to the reconciliation dashboard)');
  console.log('Adaptive sharp rendering: PASS (focused page forced to 3x / 32 MP, buffers 2x / 12 MP, flash-free promotion)');
  console.log('Viewer QoL: PASS (exact text highlight, persistent scrollbar, keyboard-friendly controls, collapsible contents)');
  console.log('Occurrence search UX: PASS (live occurrence counts, semicolon terms, active green match, grouped sentence summary)');
  console.log('Viewer zoom controls: PASS (25% commands, anchored 5% wheel steps, flash-free fit-width crossing and settled rerender)');
  console.log('Scoped text search: PASS (cascading AND facets, OR unions, division, XX_XX section, discipline, source, summary disclosure)');
  console.log('Standalone updater: PASS (semver, trusted manifest, version badge, update prompt, changelog, full HTML download)');
  dom.window.close();
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
