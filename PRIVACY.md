# Privacy

Last updated: 2026-10-25

Chess Cheat is a client-side browser extension. It has no project-owned backend, analytics endpoint, account system, or telemetry service.

## Data handled locally

- The extension reads chessboard-related page DOM, visible piece encodings, board geometry, and position information where available so it can display a move marker.
- The enabled state, marker appearance preferences, timer preference, and approved site origins are stored in the browser's local extension storage.
- The extension does not intentionally transmit page content, positions, settings, browsing history, or identifiers to the project author or a project-owned server.
- The page bridge may attempt to start a compatible same-origin UCI/Stockfish worker already included by the website. Requests made by a website's own engine are controlled by that website and are not a Chess Cheat backend.

## Permissions

The extension matches `<all_urls>` and declares `<all_urls>` host access because it is designed to detect boards across websites. This is broad permission: the content script can inspect DOM structures on pages where it runs. All HTTP(S) routes on the main Chess.com and Lichess domains are eligible automatically. On other sites, recognized practice/analysis paths are eligible, while unfamiliar paths require explicit origin approval. Approval applies to that origin and is not restricted by route names. Route detection is heuristic and cannot identify every website-specific board. Users are responsible for complying with the rules of sites where they use the extension.

## User control

You can turn the extension off from its toolbar popup, remove approved origins by clearing the extension's local storage or reinstalling it, and uninstall it from your browser's extensions page. Removing the extension removes its local storage.

## Changes

Any future network telemetry, third-party backend, or material change to data handling must be documented here before release.
