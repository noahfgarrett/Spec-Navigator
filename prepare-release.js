const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const changelog = JSON.parse(fs.readFileSync(path.join(root, 'changelog.json'), 'utf8'));
const appPath = path.join(root, 'Spec_Navigator.html');

if (!Array.isArray(changelog) || !changelog.length || changelog[0].version !== pkg.version) {
  throw new Error('The first changelog entry must match package.json version.');
}

const bytes = fs.readFileSync(appPath);
const latest = changelog[0];
const versionedFilename = `Spec_Navigator_v${pkg.version}.html`;
const versionedPath = path.join(root, versionedFilename);
fs.copyFileSync(appPath, versionedPath);
const manifest = {
  version: pkg.version,
  publishedAt: latest.date,
  filename: versionedFilename,
  downloadUrl: `https://raw.githubusercontent.com/noahfgarrett/Spec-Navigator/main/${versionedFilename}`,
  fileSize: bytes.length,
  sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  notes: latest.notes,
};

fs.writeFileSync(path.join(root, 'latest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`${versionedFilename}\nlatest.json -> v${manifest.version} · ${manifest.fileSize} bytes · ${manifest.sha256}`);
