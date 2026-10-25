# Changelog

## 1.1.0 — 2026-10-25

- Allow all HTTP(S) routes on the main Chess.com and Lichess domains; remove the live, online, tournament, challenge, and game-ID route blocks.
- Make approved origins usable across all paths instead of applying a second route-name denylist after approval.
- Keep explicit origin approval for unfamiliar, non-recognized routes and keep browser-internal/non-HTTP(S) pages unavailable.
- Improve popup diagnostics for missing content-script responses and clarify that route eligibility still depends on readable board state and a compatible page-provided engine.
- Keep engine startup bounded to a 2.5-second handshake per candidate and at most four candidate attempts.
- Update the install guide, README, privacy notes, architecture, testing checklist, and regression tests to match the current policy.

The internal browser version is maintained in `manifest.json`.

## Existing functionality

- Cross-site discovery for Chessground-style and common DOM/SVG boards, data-square/FEN attributes, accessible labels, and geometry-based piece coordinates.
- Automatic analysis when enabled and a supported board, readable position, and compatible page engine are available.
- One principal variation by default at adaptive depth 8–10, with an early provisional move as deeper analysis continues.
- Page-provided UCI/Stockfish worker discovery with Chess.com-specific worker fallbacks; no engine binary is bundled.
- Arrow, square-highlight, and combined modes; configurable marker color and line weight; optional position timer.
- FEN/UCI validation, stale-recommendation clearing, unit tests, and a local mock-board browser smoke fixture.
- GitHub issue templates, security/privacy guidance, contribution documentation, attribution notes, CI, and release instructions.
