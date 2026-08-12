# Release checklist

1. Update `package.json` to the new semantic version.
2. Add a newest-first entry with the identical version to `changelog.json`.
3. Run `npm install` if dependencies changed.
4. Run `npm test` and require every check to pass.
5. Run `npm run prepare-release`.
6. Confirm the version is embedded in `Spec_Navigator.html`.
7. Confirm `Spec_Navigator_vX.Y.Z.html` exists and `latest.json` reports that exact filename, version, file size, checksum, notes, and trusted raw GitHub URL.
8. Update `CHANGELOG.md`.
9. Commit and push all release files together to `main`.

Do not publish `latest.json` before its matching HTML. The release commit should move both files atomically so existing applications never receive a manifest for an unavailable package.
