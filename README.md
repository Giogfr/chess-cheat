# Chess Cheat

Chess Cheat is an open-source Chrome and Edge extension that finds chessboards in page markup and draws a suggested move over them. It does not click squares or make moves. It is meant for learning and experimentation, and the MIT-licensed source can be read and modified.

All HTTP(S) routes on the main Chess.com and Lichess domains are eligible automatically, including live games and tournaments. On other sites, recognized practice, study, puzzle, and analysis paths are eligible automatically; other origins can be approved from the popup. A move hint still requires a readable board position and a compatible engine that the page already exposes. The extension does not bundle Stockfish.

“Detectable” has a practical boundary: a board must expose enough information through DOM elements, accessible labels, attributes, geometry, or a page API to identify its pieces and squares. Pure canvas/WebGL boards with no exposed position state, obfuscated inaccessible state, and custom implementations may still need a site-specific adapter. The extension does not bundle an engine; it attempts to reuse a compatible same-origin UCI/Stockfish worker loaded by the page. Therefore board detection, position reconstruction, and engine availability are separate capabilities—not every detected board can necessarily be analyzed.

## What it does

- Starts analysis automatically on Chess.com and Lichess pages while enabled, and on recognized practice/analysis routes elsewhere.
- Shows the selected move as an arrow, source/destination square highlights, or both.
- Lets you choose the marker color and line weight in the toolbar popup. Changes are saved immediately so closing the popup does not discard them.
- Shows a provisional move after an early principal variation arrives, then refines it as analysis continues. Default search work is reduced to one principal variation at adaptive depth 8–10.
- Offers an optional on-board position timer.
- Saves the enabled state and display preferences in `chrome.storage.local`.
- Applies a default page policy to known route patterns and asks for approval on unfamiliar origins. The extension does not make moves on your behalf.

Move selection is a heuristic. It is not a calibrated Elo or IQ model, and it cannot guarantee a particular strength or result.

## Install from source

1. Download and extract the **install ZIP** from the project release, or clone this repository.
2. Make sure you select the folder that has `manifest.json` directly inside it—not a parent folder and not the ZIP file itself. The install ZIP is packaged with `manifest.json` at its root specifically to avoid the common “Manifest file is missing” error.
3. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose that extracted folder.
6. Open a chessboard on Chess.com or Lichess; all HTTP(S) routes on those sites are eligible. On an unfamiliar site, open the toolbar popup and choose **Approve this site** to approve that origin. Analysis starts only when the board position is readable and a compatible page-provided engine is available.
7. Use the Chess Cheat toolbar icon to switch it off or on and change marker settings.

After editing the code, use **Reload** on the extension card and refresh the target chess site tab. Existing tabs do not automatically reload updated content scripts.

## Toolbar settings

| Setting | Behaviour |
| --- | --- |
| **Turn on / Turn off** | Enables or stops analysis on supported routes. Turning it off clears the marker and stops the worker session. |
| **Style** | `Arrow`, `Squares`, or `Both`. Square mode highlights the move's source and destination. |
| **Color** | Sets the marker color. |
| **Line weight** | Sets the marker thickness to thin, normal, or bold. |
| **Show position timer** | Shows or hides the time indicator next to the board when space is available. |

The default enabled state is on unless a saved preference says otherwise. Settings persist across browser sessions. The timer resets when the detected piece placement changes; it is display-only and does not determine when a recommendation is shown.

## How it works

1. `popup.html` and `popup.js` provide the toolbar popup and persist settings.
2. `content.js` detects the supported route and board, resolves a position, coordinates engine searches, and updates the overlay.
3. `background.js` validates the tab URL and frame before injecting the page-world bridge.
4. `bridge.js` searches for a full FEN or reusable UCI/Stockfish worker exposed by the current site, while retaining Chess.com-specific worker fallbacks.
5. `turn-detection.js` validates FEN and applies best-effort fallbacks using visible clocks, the move list, last-move highlights, and observed piece movement.
6. `engine-commands.js` validates supported engine commands and FEN input.
7. `move-styles.js` selects from available evaluated candidate lines when the engine's reduced-skill option is unavailable.
8. `move-overlay.js` renders the arrow and/or square highlights; `visual-settings.js` normalizes the saved appearance settings.

## Known limits

- There is no universal chessboard DOM API. The generic fallback scans visible near-square DOM elements for piece encodings and geometry, but board parsing remains heuristic. Custom markup, unusual piece rendering, perspective controls, virtualization, or move animations may need a site-specific adapter. Canvas/WebGL-only boards are not readable unless the page exposes a FEN or another position API.
- The extension does not bundle Stockfish. It searches for a compatible same-origin worker already loaded by the site; pages without one will report that no compatible engine was found. Engine worker discovery is heuristic and site implementations can change.
- A full FEN contains side to move, castling rights, en-passant state, and move counters. If the site does not expose a usable FEN, the extension reconstructs a best-effort position from the visible board and observed moves. A board first seen mid-game may not provide enough history to recover every rule state. If the side to move cannot be established reliably, the extension waits instead of silently guessing.
- The timer simulates human thinking delays.
- All HTTP(S) routes on the main Chess.com and Lichess domains are eligible automatically. Other sites may be eligible through recognized practice/analysis paths or after the user approves the origin; approval applies to the whole origin. Browser-internal URLs and non-web protocols remain unavailable. Route detection is heuristic. The policy lives in `site-policy.js` and can be adapted by developers; users remain responsible for applicable laws and platform rules and for complying with each site’s rules. Cross-site automatic detection requires broad host access, which lets the extension inspect page DOM on websites you visit. Review `PRIVACY.md` and the permission note below before installing.
- The automated browser smoke test uses a local mock board and mock engine. Passing it does not prove integration with any live chess site; test each target site manually after installing.

## Permissions and privacy

The extension declares access to all web URLs so it can inspect boards on arbitrary sites and inject its page-world bridge when a route is allowed. It uses local extension storage for settings and approved site origins. It does not send page contents, positions, settings, or analytics to a project-owned server. It may start a site-provided same-origin engine worker; that worker and its license remain controlled by the site/provider. See [`PRIVACY.md`](PRIVACY.md).

## Requirements and checks

- Chrome or Edge with Manifest V3 support.
- Node.js 18 or newer for the local checks.
- No npm dependencies are required for the extension itself.

Run these commands from the project directory:

```sh
npm run check
npm test
npm run test:smoke
```

`npm run check` validates the manifest references, required metadata, icon dimensions, and JavaScript syntax. `npm test` runs the Node.js unit tests. `npm run test:smoke` tries to launch headless Chromium against the local mock fixture; it requires a working Chromium / Chrome installation and may be unavailable in restricted environments.

GitHub Actions runs static checks and unit tests on pushes and pull requests. Publishing a GitHub Release triggers a second workflow that builds an install ZIP with `manifest.json` at the archive root, a complete source archive, and SHA-256 checksums, then attaches them to that release. Neither workflow tests the live Chess.com site.

## Project structure

```text
chess-cheat/
├── .github/                   # CI/release workflows, issue templates, PR template
├── docs/
│   ├── INSTALL.md            # concise install-package guide
│   ├── architecture.md       # runtime flow and boundaries
│   ├── testing.md            # automated and manual checks
│   └── RELEASING.md          # GitHub release checklist
├── icons/                    # extension icons
├── tests/
│   ├── fixtures/board.html   # local board / mock-engine fixture
│   ├── background.test.js    # URL eligibility and injection
│   ├── bridge.test.js        # engine bridge lifecycle
│   ├── engine-commands.test.js
│   ├── move-overlay.test.js  # arrow and square rendering
│   ├── move-styles.test.js   # candidate selection
│   ├── popup.test.js         # popup and saved preferences
│   ├── think-timer.test.js   # elapsed-time formatting
│   ├── turn-detection.test.js
│   └── visual-settings.test.js
├── scripts/
│   ├── check.cjs             # manifest, file and syntax checks
│   └── smoke-browser.cjs     # optional local Chromium smoke test
├── site-policy.js            # URL eligibility and unknown-origin approval policy
├── board-adapter.js          # known selectors plus generic DOM/geometry detection
├── background.js             # guarded page-world injection
├── bridge.js                 # generic FEN / engine-worker discovery
├── content.js                # board tracking, analysis and overlay
├── engine-commands.js        # UCI command validation
├── move-overlay.js           # arrow / square rendering
├── move-styles.js            # candidate selection
├── think-timer.js            # elapsed-time formatting
├── turn-detection.js         # FEN and turn fallbacks
├── visual-settings.js        # saved marker preferences
├── popup.html                # toolbar popup
├── popup.css                 # popup styles
├── popup.js                  # toggle and preference controls
├── manifest.json
├── package.json
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── CREDITS.md
├── PRIVACY.md
├── SECURITY.md
└── LICENSE
```

## Troubleshooting

**No marker appears:** Check that the extension is on, navigate to a supported chessboard route, and give the board a moment to settle. Open the popup to read the current status.

**Page unavailable to extensions:** Browser-internal URLs and browser-store pages restrict extension scripts. On a normal website, confirm the extension has site access, reload it on `chrome://extensions`, and refresh the chess tab. If no move appears, check whether the page exposes readable board state and a compatible engine.

**The popup says a site needs approval:** On an unfamiliar site, choose **Approve this site**. Approval is stored per origin and applies to every route on that origin.

**The marker moves while the engine is thinking:** A provisional move appears after an early principal variation and may refine as the engine searches deeper. A new board position clears stale recommendations.

**The timer is missing:** Enable **Show position timer** in the popup. It appears after a supported board and position are detected.

**The side to move is unknown:** The page may not expose a usable FEN, clock, move list, or last-move marker. The extension waits for more position information rather than guessing.

**Engine connection fails:** The site may not expose a reusable UCI worker, or it may have changed its worker implementation. Reloading the extension cannot fix a site-side change by itself. Record the popup status, site URL path (without identifiers), and browser version when reporting the problem; do not share cookies or account tokens.

**The marker is offset:** Try resizing the board or refreshing the tab. Note whether the board is flipped if the issue remains.

## Contributing

Keep helpers small and browser-compatible. Run `npm run check` and `npm test` before submitting a change. Run the browser smoke test when a working headless Chromium installation is available. Changes to FEN handling, UCI parsing, search cancellation, worker discovery, or overlay geometry should include regression tests.

## License and external components

Original project files are licensed under the MIT License; see [`LICENSE`](LICENSE). Inspiration and project boundaries are documented in [`CREDITS.md`](CREDITS.md). No Stockfish binary or third-party engine source is bundled. The extension attempts to reuse a compatible engine worker already loaded by the current site; site-provided engine assets remain subject to their own terms and licenses.

The `version` field in `manifest.json` is required browser metadata, not a guarantee of compatibility with every website. See [`docs/RELEASING.md`](docs/RELEASING.md) for a clean GitHub release workflow.
