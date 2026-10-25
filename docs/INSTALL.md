# Install Chess Cheat

Chess Cheat is an open-source Chrome / Edge Manifest V3 extension for chessboard detection and engine-assisted analysis. All HTTP(S) routes on the main Chess.com and Lichess domains are eligible automatically; recognized practice/analysis paths on other sites may also be eligible, and unfamiliar origins can be approved from the popup. The extension does not bundle Stockfish; a compatible engine must already be exposed by the site.

## Install in Chrome or Edge

1. Extract this ZIP into a normal folder.
2. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose the extracted folder containing `manifest.json`.
5. Open a chessboard on Chess.com or Lichess, or a recognized practice/study/analysis board on another site.
6. Click the Chess Cheat toolbar icon to turn analysis off/on and adjust arrow/square appearance.

After replacing the extension files or clicking **Reload** on the extension card, refresh the chess-site tab as well; an already-open tab may still have the previous content scripts.

## Status and troubleshooting

- **Supported page not responding:** confirm the extension is enabled and has site access, click **Reload** on its card in `chrome://extensions`, then refresh the site tab.
- **Page unavailable to extensions:** Chrome and Edge restrict content scripts on browser-internal pages (`chrome://`, `edge://`, `about:`) and their extension-store pages. Open a normal website tab.
- **No chessboard detected:** detection needs readable DOM/SVG board elements, accessible piece labels, piece geometry, or a position/FEN API. Some canvas/WebGL boards cannot be read without a site-specific adapter.
- **No compatible engine found:** the extension reuses a page-provided same-origin UCI/Stockfish worker; it does not download or include an engine. Startup tries up to four candidates with a 2.5-second handshake timeout per candidate. A changed or inaccessible site worker may still prevent analysis.
- **The move marker is missing or offset:** confirm a supported board is visible, wait for the board position to settle, then resize/refresh the page. The extension does not make moves for you.

## Permissions and privacy

The extension requests active-tab, script-injection, local-storage, and all-sites access so it can inspect potential chessboards on different websites and inject a page-world bridge on eligible pages. Settings and approved origins stay in local browser storage; the project has no telemetry service or project-owned backend. Review `PRIVACY.md` before installing.

## License

The project source is distributed under the MIT License; see `LICENSE`. Site-provided engine code remains subject to its own license and terms.
