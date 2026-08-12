# Spec Navigator v1.0.2 - Codex handoff

This lightweight package intentionally omits the large generated HTML files.
Codex will reproduce `Spec_Navigator.html`, `Spec_Navigator_v1.0.2.html`, and
`latest.json` from the included source before publishing.

Open this extracted folder in Codex and submit the following request:

> Publish this Spec Navigator release as a new public GitHub repository.
>
> Repository settings:
> - Owner: `noahfgarrett`
> - Name: `Spec-Navigator`
> - Visibility: public
> - Default branch: `main`
>
> Complete these steps:
> 1. Inspect `package.json` and `changelog.json` and confirm the release is v1.0.2.
> 2. Run `npm ci`, `npm test`, and `npm run prepare-release`.
> 3. Verify that `latest.json` references `Spec_Navigator_v1.0.2.html` and that its recorded byte size and SHA-256 match the generated HTML.
> 4. Check whether GitHub CLI is installed and authenticated. If it is missing on Windows, run `winget install --id GitHub.cli`. If authentication is required, run `gh auth login` and pause for me to finish the browser login.
> 5. Initialize this folder as a Git repository with `main` as the default branch if necessary.
> 6. Commit all source and generated release files with the message `Initial Spec Navigator v1.0.2 release`.
> 7. Create and publish the repository using `gh repo create noahfgarrett/Spec-Navigator --public --source=. --remote=origin --push`.
> 8. Do not initialize a separate remote README, license, or gitignore because the local project already contains its files.
> 9. Verify that these public URLs return successfully:
>    - `https://raw.githubusercontent.com/noahfgarrett/Spec-Navigator/main/latest.json`
>    - `https://raw.githubusercontent.com/noahfgarrett/Spec-Navigator/main/Spec_Navigator_v1.0.2.html`
> 10. Download or otherwise hash the published HTML and confirm it still matches the SHA-256 in the public `latest.json`.
> 11. Report the repository URL, commit SHA, test results, and public update-endpoint verification.

After publication, existing Spec Navigator v1.0.1 copies should automatically
detect and offer v1.0.2 when opened or refreshed.
