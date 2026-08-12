# Spec Navigator

Spec Navigator is a standalone, local-first HTML application for reconciling a project specification index against division folders and browsing the resulting PDF set without creating one enormous combined document.

## Download and run

1. Download `Spec_Navigator.html`.
2. Open it in current Chrome or Edge.
3. Choose the project ZIP or root folder.

No installation, account, web server, or adjacent application files are required.

## Matching rules

- Read `Current Project Specifications Index.xlsx` and detect the header row containing Spec Number, Specification, Discipline, Rev, and Date.
- Match `XX_XX_XX_XX` spec numbers, with an optional five-digit value in parentheses.
- Include eligible PDFs that do not match the index as clearly labeled folder-only specs.
- Exclude PDFs with a hyphen in the filename or any nested path below the DIVISION folder.
- Exclude filenames containing DAT or APP, case-insensitively.
- When multiple eligible files share a spec number, select the highest standalone `r#` revision.

## Viewer zoom

- The `+` and `-` buttons and Ctrl/Cmd `+` or `-` move in 25% steps.
- Ctrl/Cmd plus the mouse wheel moves in 5% steps when the pointer is directly over a PDF page.
- Mouse-wheel zoom keeps the document point beneath the cursor anchored in place.
- Wheel gestures keep the existing page visible and defer the sharp rerender until the gesture settles, including when crossing fit width.

## Search scope

- AND mode is the default. Selected categories are combined, and every other filter list immediately hides choices that cannot match.
- Multiple choices within one category remain inclusive; for example, two checked disciplines match either discipline while still respecting selected divisions and sections.
- OR mode keeps all filter choices visible and includes a spec when any selected division, section, discipline, or source matches.
- The text query is applied within the resulting AND or OR scope.

## Privacy and updates

Project files are processed entirely inside the browser and are never uploaded.

On launch, the app makes one small request to the public `latest.json` file in this repository. If its semantic version is newer, the app shows the published changelog and offers to download the complete versioned application, such as `Spec_Navigator_v1.1.0.html`. The packaged application is fetched only after the user clicks the download button and is checked against the manifest's size and SHA-256 digest when supported by the browser.

## Development

Requirements: Node.js 20 or newer.

```bash
npm install
npm run build
npm test
```

The production build is `Spec_Navigator.html`. The build script embeds JSZip, SheetJS, pdf-lib, pako, PDF.js, the PDF.js worker, the application version, and the changelog into that one file.

## Publishing an update

1. Bump `version` in `package.json`.
2. Add the same version to the top of `changelog.json`.
3. Run `npm test`.
4. Run `npm run prepare-release`.
5. Commit and push the source, `Spec_Navigator.html`, and `latest.json` together.

`prepare-release` rebuilds the application, creates `Spec_Navigator_vX.Y.Z.html`, and regenerates `latest.json` with that exact filename, byte size, and SHA-256 digest. Existing copies will detect the new version the next time they are opened or refreshed.

## Main files

- `spec-navigator.template.html` - editable application source
- `build-standalone.js` - single-file bundler
- `qa-test.js` - end-to-end synthetic package and viewer checks
- `changelog.json` - changelog embedded in the app
- `prepare-release.js` - release manifest generator
- `latest.json` - one-request public update manifest
- `Spec_Navigator.html` - downloadable packaged application
- `Spec_Navigator_vX.Y.Z.html` - versioned release downloaded by users
