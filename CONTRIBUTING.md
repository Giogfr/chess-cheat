# Contributing

Keep helpers small, dependency-free, and compatible with the browser runtime unless a dependency solves a concrete problem.

Before submitting a change, run:

```sh
npm run check
npm test
```

When a working headless Chromium installation is available, also run:

```sh
npm run test:smoke
```

Changes to FEN handling, turn detection, UCI parsing, search cancellation, worker discovery, settings persistence, or overlay geometry should include regression tests. Do not commit browser profiles, private keys, personal session data, generated test output, or engine binaries copied from the site.
