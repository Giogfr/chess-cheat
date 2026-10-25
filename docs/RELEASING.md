# GitHub Release Checklist

This is a source repository first. The packaged install ZIP is an additional convenience for unpacked installation; it is not a signed Chrome Web Store package.

## Before publishing

1. Review `README.md`, `CHANGELOG.md`, `PRIVACY.md`, `SECURITY.md`, `CREDITS.md`, and `LICENSE` together.
2. Run the checks from the project root:

   ```sh
   npm run check
   npm test
   npm run test:smoke
   ```

   The browser smoke test requires a working local Chromium/Chrome binary. If it cannot run in CI or the build environment, report that limitation rather than claiming it passed.
3. Manually install the extracted project directory in current Chrome and/or Edge. Check board detection on a known route and one different DOM board implementation. Unit tests verify URL eligibility; the local smoke fixture is deterministic, and any site integration check should use an account and page where testing is permitted.
4. Confirm `manifest.json` has the required internal browser version and that the broad host-access rationale is still accurate.
5. Inspect `git diff --check`, `git status`, and the archive contents. Never package browser profiles, session data, private keys, local logs, or engine binaries copied from a platform.
6. Confirm the license and any third-party notices cover every distributed file. Do not relicense copied code without permission and compatible terms.

## Create install and source archives

The install ZIP contains only files needed to run the extension, with the installation guide as its root `README.md`. The source ZIP keeps the full repository, including tests, docs, and GitHub workflows.

The release workflow creates both archives automatically. To build them locally from a clean checkout:

```sh
mkdir -p dist/install
cp manifest.json background.js bridge.js site-policy.js board-adapter.js \
  visual-settings.js move-overlay.js move-styles.js turn-detection.js \
  think-timer.js engine-commands.js content.js popup.html popup.js popup.css \
  LICENSE PRIVACY.md CREDITS.md CHANGELOG.md SECURITY.md dist/install/
cp docs/INSTALL.md dist/install/README.md
cp -R icons dist/install/icons
(cd dist/install && zip -qr ../chess-cheat-install.zip .)
git archive --format=zip --prefix=chess-cheat/ HEAD -o dist/chess-cheat-github-source.zip
sha256sum dist/chess-cheat-install.zip dist/chess-cheat-github-source.zip > dist/SHA256SUMS.txt
unzip -Z1 dist/chess-cheat-install.zip | grep -Fx 'manifest.json'
unzip -t dist/chess-cheat-install.zip
```

The install ZIP should be extracted before using **Load unpacked**. `manifest.json` must be at the root of the extracted install folder. The source ZIP is for publishing, inspecting, and modifying the full project; it is not the ZIP to select in **Load unpacked**.

## Publish to GitHub

1. Create a repository and push the complete source tree, not only the install ZIP.
2. Make sure the default branch's CI workflow runs on push and pull request.
3. Create and publish a GitHub Release only after the checks and manual site checks are honestly documented.
4. The release workflow automatically attaches the install ZIP, source archive, and checksums. The install ZIP is checked to ensure `manifest.json` is at the archive root.
5. Include the limitations about DOM-only detection, position reconstruction, engine reuse, and origin-approval behavior in release notes. State that Chess.com/Lichess routes are URL-eligible automatically, but actual integration depends on page support. The workflow does not test live third-party sites.

## Versioning

`manifest.json` requires a dotted numeric version for browser metadata. Update it when preparing a public release. Archive filenames may remain stable or use a release tag, but the README, manifest, changelog, and attached artifact must agree about what was tested.
