# Testing

The automated checks cover manifest and source validation, UCI command validation, bridge lifecycle, page-world FEN reads, URL eligibility, known board encodings, geometry-based detection of unlabelled DOM boards, false-positive rejection, marker rendering, appearance settings, elapsed-time formatting, and turn inference.

## Automated checks

Run from the project directory:

```sh
npm run check
npm test
npm run test:smoke
```

- `npm run check` validates manifest references and required metadata, checks icon dimensions, and runs JavaScript syntax checks.
- `npm test` runs the Node.js unit tests, including route-aware popup diagnostics and bounded engine-worker startup timeout/candidate handling.
- `npm run test:smoke` launches headless Chromium against a local fixture with a mock board and mock engine. It needs a working Chromium / Chrome binary and does not connect to the live Chess.com site.

A passing local test suite does not prove that any live site exposes a compatible engine worker or position state. Cross-site support must be manually verified in the target browser on each site.

## Manual regression checklist

1. Load the project through `chrome://extensions` → Developer mode → **Load unpacked**.
2. Open a chessboard on Chess.com or Lichess and confirm detection. On an unfamiliar site, use the popup to approve the origin after reviewing the site and its rules.
3. Confirm a provisional marker appears once an early principal variation arrives, then refines as the search continues, with no floating control panel injected into the page.
4. Choose **Squares** in the popup and confirm the source and destination are highlighted without an arrow.
5. Choose **Both**, then change the marker color and line weight. Confirm the marker updates.
6. Turn the extension off and confirm the search stops and the marker clears. Turn it on again.
7. Open several Chess.com and Lichess routes, including a live-game or tournament URL, and confirm none is rejected by the URL policy. Verify that an approved origin on another site remains eligible across different paths; actual analysis still depends on board parsing and engine availability.
8. Test positions where White and Black are to move, including an analysis board opened mid-game.
9. Flip the board, resize the window, and change browser zoom. Confirm the marker remains aligned to the intended squares.
10. Change the board while a search is running. Confirm the old recommendation clears and the new position receives a fresh provisional marker without stale-move flicker.
11. Reload the browser and confirm that the enabled state and marker preferences persist.
12. Repeat the detection/position check on another site using a different implementation, such as a DOM/SVG board, a Chessground-style board, or a DOM board without chess-specific class names.
13. Note whether board detection, position reconstruction, and engine reuse each work; success in one step does not imply the others work.
14. For a canvas/WebGL-only board, check whether the site exposes a FEN/current-position API before reporting a detection limitation.
15. If engine startup fails, note the popup status and browser version. Do not share cookies, session tokens, or account credentials.

## Position timer checklist

1. Enable **Show position timer** in the toolbar popup.
2. Confirm the `Position time · 00:00` indicator appears after a supported board and position are detected.
3. Wait at least two seconds and confirm the counter advances.
4. Make a move and confirm the counter resets when the detected piece placement changes.
5. Disable the setting and confirm the indicator disappears without affecting engine analysis.
6. Enable it again and confirm it resumes displaying elapsed time.
