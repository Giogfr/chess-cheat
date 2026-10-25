# Architecture

Chess Cheat is a Manifest V3 browser extension with a toolbar popup, shared URL policy and board-adapter modules, content script, service worker, and page-world bridge. It matches all web URLs so it can detect boards on different sites; this requires broad host access.

- `popup.js` stores the enabled state, marker appearance, and position-timer preference in `chrome.storage.local`.
- `site-policy.js` allows all HTTP(S) routes on the main Chess.com and Lichess domains. Recognized practice/analysis paths on other sites are eligible automatically; unfamiliar paths require explicit origin approval, and that approval applies across route names.
- `board-adapter.js` prefers known DOM/SVG board roots, recognizes piece classes/data/ARIA labels/alt text/Unicode glyphs, reads FEN attributes/APIs, and falls back to a throttled scan of near-square DOM geometry for unlabelled board roots.
- `content.js` applies the route policy, observes the board, resolves a position, coordinates searches, updates the marker, and owns the elapsed-time display.
- `background.js` validates the URL, stored origin approval, and frame before injecting the page-world scripts.
- `bridge.js` attempts to read a full FEN and discovers a compatible same-origin Stockfish/UCI worker from page resources, with Chess.com-specific fallbacks. It cannot analyze arbitrary boards if a site exposes neither a position nor a compatible engine.
- `turn-detection.js` validates FEN and provides best-effort turn inference from visible clocks, move-list ply, last-move highlights, and observed board changes.
- `engine-commands.js` validates FEN and the supported UCI command forms.
- `move-styles.js` chooses from evaluated candidate lines. The selection heuristic is not an Elo or IQ model.
- `move-overlay.js` draws the selected move as an arrow, square highlights, or both.
- `visual-settings.js` normalizes persisted appearance settings.
- `think-timer.js` formats elapsed time. The timer is display-only and does not change search commands or selected moves.

## Analysis flow

1. The extension starts enabled unless a saved preference turns it off.
2. Chess.com and Lichess routes may start automatically, including live-game and tournament routes. Recognized practice/analysis routes elsewhere are eligible, and an unfamiliar origin requires explicit approval after a board is detected; approval then applies to all routes on that origin.
3. The service worker validates the URL, stored origin approval, and frame before it injects the page-world bridge.
4. The bridge requests the current FEN when available, discovers an engine-worker candidate, performs the UCI handshake, and forwards permitted engine commands.
5. The content script tracks the latest position. If the position changes during a search, it stops the old search and starts the newest queued position after the old search reports completion.
6. The first useful principal variation can draw a provisional move once it reaches depth 4. Later search info can refine that choice; `bestmove` finalizes the current search. When the board changes, the old marker is cleared and the newest position is queued.
7. The overlay applies the saved marker mode, color, and line weight.
8. If the timer is enabled, it shows elapsed time for the current detected piece placement. It does not wait before presenting engine output.

## State and position limits

Piece placement is read from board-specific piece/square tokens where available, then from piece data attributes or rendered geometry. The extension prefers a full FEN exposed by the page. Clocks, move-list ply, last-move highlights, and observed piece movement are fallbacks, not complete replacements for game state. When the board first appears mid-game and no full FEN is available, castling rights, en-passant state, and move counters may be incomplete. If the side to move cannot be identified with enough confidence, the extension waits rather than silently assuming one.

## Runtime boundaries

The service worker permits all HTTP(S) routes on the main Chess.com and Lichess domains. It allows recognized practice/analysis routes elsewhere, requires saved origin approval for unfamiliar routes, and restricts bridge injection to the top-level frame. No route-name block is applied to live, online, tournament, or challenge paths. The page bridge validates forwarded commands and stops the worker session when analysis is turned off or the route becomes unsupported. The extension does not bundle an engine or send settings to a project-owned backend. Sites that do not expose a reusable same-origin UCI worker may be detected but not analyzed; canvas/WebGL-only boards or custom markup without accessible piece/position information may require a dedicated adapter.
