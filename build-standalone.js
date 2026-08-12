const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'spec-navigator.template.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const changelog = JSON.parse(fs.readFileSync(path.join(root, 'changelog.json'), 'utf8'));
if (!Array.isArray(changelog) || !changelog.length || changelog[0].version !== pkg.version) {
  throw new Error('The first changelog entry must match package.json version.');
}
html = html.replaceAll('__SPEC_NAVIGATOR_APP_VERSION__', pkg.version);
html = html.replace('/*__SPEC_NAVIGATOR_CHANGELOG__*/', JSON.stringify(changelog));
const libraries = {
  '/*__JSZIP__*/': path.join(root, 'node_modules/jszip/dist/jszip.min.js'),
  '/*__XLSX__*/': path.join(root, 'node_modules/xlsx/dist/xlsx.full.min.js'),
  '/*__PDFLIB__*/': path.join(root, 'node_modules/pdf-lib/dist/pdf-lib.min.js'),
  '/*__PAKO__*/': path.join(root, 'node_modules/pako/dist/pako.min.js'),
  '/*__PDFJS__*/': path.join(root, 'node_modules/pdfjs-dist/build/pdf.min.js'),
  '/*__PDFJS_WORKER__*/': path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.js'),
};

for (const [marker, source] of Object.entries(libraries)) {
  const code = fs.readFileSync(source, 'utf8').replace(/<\/script/gi, '<\\/script');
  if (!html.includes(marker)) throw new Error(`Missing template marker: ${marker}`);
  html = html.replace(marker, () => code);
}

const output = path.join(root, 'Spec_Navigator.html');
fs.writeFileSync(output, html);
console.log(`${output}\n${fs.statSync(output).size} bytes`);
