 <div align="center">
  <img src="icons/icon128.png" alt="Chess Cheat extension icon" width="96" height="96" />
  <h1>Chess Cheat</h1>
  <p><strong>A browser-extension project for chessboard detection, position analysis, and on-board move visualization.</strong></p>
  <p>
    <a href="https://github.com/Giogfr/chess-cheat/actions/workflows/ci.yml"><img src="https://github.com/Giogfr/chess-cheat/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/Giogfr/chess-cheat?style=flat-square" alt="License" /></a>
    <img src="https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome and Edge" />
    <img src="https://img.shields.io/badge/Extension-Manifest%20V3-6C5CE7?style=flat-square" alt="Manifest V3" />
    <img src="https://img.shields.io/badge/JavaScript-Project-F7DF1E?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript" />
  </p>
</div>

---

## ♟️ Overview

Chess Cheat is an open-source browser-extension project for exploring how a browser extension can recognize a chessboard, track a position, connect analysis components, and draw configurable visual move markers over a board. Its controls live in the browser-extension popup, and display preferences are saved between sessions.

The project is also a practical codebase for studying Chromium extensions, DOM-based board adapters, page/extension messaging, state tracking, and automated tests.

> **Fair-play notice:** Use engine assistance only in analysis, study, or other settings where it is explicitly permitted. Do not use it to gain an advantage in rated games, tournaments, or any game whose rules prohibit outside assistance. Follow the rules of the chess platform and the event you are participating in.

## 🎬 Showcase

A quick walkthrough of Chess Cheat in action.

https://github.com/user-attachments/assets/6109313e-4ea5-4b29-8a1a-c837af2b7607

## ✨ Features

### ♟️ Board and position handling

- Board-detection adapters intended to work with supported chess pages.
- Position and side-to-move tracking, with explicit handling for uncertain detection.
- A site-eligibility policy that limits where the extension attempts to operate.
- Board tracking and analysis-flow coordination, with guarded page-bridge injection.

### 🎯 Visual move display

- On-board move markers and overlay rendering.
- Configurable visual styles for the displayed markers.
- Saved display preferences, so selected options persist after the popup closes or the browser reloads.
- Position-timing support for analysis and experimentation.

### 🧩 Extension interface and integration

- Popup controls accessible from the browser’s extension toolbar.
- Page/extension bridge and engine-command validation.
- Separate components for site eligibility, board adapters, turn detection, display settings, and popup behavior.

### 🧪 Test coverage

The repository includes automated tests for:

- Background coordination and popup behavior.
- Board adapters, page bridging, and turn detection.
- Engine-command validation.
- Move overlays and visual styles.
- Saved visual settings and the thinking timer.
- Site-eligibility policy.

Compatibility depends on the website’s current page structure and on the analysis components available to the extension. A site or board variant that is not supported may not be detected correctly.

## 📥 Installation

Chess Cheat is installed as an unpacked extension in Chrome or Microsoft Edge.

1. **Download the project.** On GitHub, choose **Code → Download ZIP** and extract the ZIP, or clone the repository:

   ```powershell
   git clone https://github.com/Giogfr/chess-cheat.git
   ```

2. Open the browser’s extension management page:
   - Chrome: `chrome://extensions`
   - Microsoft Edge: `edge://extensions`

3. Turn on **Developer mode**.
4. Select **Load unpacked**.
5. Choose the **project root directory that contains `manifest.json`**. Do not select the ZIP, the parent directory, or an individual file.
6. Pin the extension from the browser toolbar if you want quick access to its popup.
7. Open a supported chessboard page and refresh that page after installing or updating the extension.

> **Manifest check:** If the browser reports that the manifest is missing or unreadable, confirm that the folder you selected contains `manifest.json` directly. If it does not, you have selected the wrong directory.

## 🕹️ Using the extension

1. Open a board in a supported setting where external analysis is permitted.
2. Open Chess Cheat from the browser’s extension toolbar.
3. Check that the extension recognizes the board and current position before relying on any displayed information.
4. Adjust the available display preferences from the popup.
5. Confirm that the move markers match the board’s orientation and current position.
6. To apply a changed build, reload the extension on the extensions page and refresh the target page.

The popup and available options may change as the project develops. Do not assume that a board is supported simply because it appears on a chess website.

## 🧰 Development

### Requirements

- Google Chrome or Microsoft Edge for manual extension testing.
- A recent Node.js installation for the repository’s automated checks and tests.
- Git, if you plan to clone the repository and contribute changes.

The unpacked extension is loaded directly from the project root when its `manifest.json` is present; follow the scripts in `package.json` for the repository’s specific development workflow.

### Run the automated tests

The project includes Node-based tests under `tests/`. From the repository root, run:

```powershell
node --test
```

The repository also includes check and browser-smoke-test scripts:

```powershell
node scripts/check.cjs
node scripts/smoke-browser.cjs
```

The browser smoke test may require a suitable local browser environment. A test command reporting success is not a guarantee that every chess site, browser version, theme, or board layout is supported; verify changes in the target browser as well.

## 🏗️ Architecture at a glance

The code is separated into focused parts so that board handling, extension messaging, analysis coordination, and the UI can be tested independently.

| Area | Responsibility |
| --- | --- |
| Site eligibility | Decides whether the extension should attempt to run on the current page. |
| Board adapters | Reads board information from supported page structures. |
| Position and turn detection | Tracks the board position and determines which side is to move. |
| Page bridge | Coordinates page-side integration through guarded injection and messaging. |
| Analysis flow | Validates engine commands and coordinates position analysis. |
| Move overlay | Renders markers and applies the selected visual style. |
| Popup and preferences | Exposes controls and persists display settings. |
| Tests | Exercises the extension’s coordination, detection, bridge, and display behavior. |

For more detail, see the project’s `docs/` directory and the source comments near each component.

## 🛠️ Troubleshooting

<details>
  <summary><strong>The browser says the manifest is missing or unreadable</strong></summary>

  Use **Load unpacked** and select the directory containing `manifest.json` itself. If you extracted a ZIP, make sure you have not selected an outer folder that contains another project folder.
</details>

<details>
  <summary><strong>The extension does not detect the board</strong></summary>

  Refresh the chess page, wait for the board to finish loading, and check whether the current site and board type are supported. Page redesigns, custom board layouts, animations, or variants may change the page structure the extension can read.
</details>

<details>
  <summary><strong>The displayed marker looks incorrect or reversed</strong></summary>

  Verify the detected side to move and board orientation. Refresh the page after the board has fully loaded, then check detection again. Do not rely on a marker when the position or orientation is uncertain.
</details>

<details>
  <summary><strong>Changes do not appear after updating the code</strong></summary>

  Open `chrome://extensions` or `edge://extensions`, reload Chess Cheat, and then refresh the chess page. Existing tabs may still have the previous content script loaded.
</details>

<details>
  <summary><strong>A check or browser smoke test fails</strong></summary>

  Read the first reported error, confirm the expected Node.js and browser environment is available, and rerun the failing check. A passing unit test alone does not prove compatibility with every live page.
</details>

## 🔐 Permissions and privacy

Review `manifest.json` to see which browser permissions the extension requests, and read [`PRIVACY.md`](PRIVACY.md) for the project’s privacy notes. Review the source code before loading extensions from any repository, and grant only the permissions you understand and expect.

## 🤝 Contributing

Contributions, bug reports, and reproducible test cases are welcome. Before opening a pull request:

1. Keep changes focused and consistent with the existing code style.
2. Run the available automated tests and check scripts.
3. Test the change in Chrome or Edge when it affects browser behavior.
4. Update documentation when behavior, supported pages, permissions, or setup steps change.
5. Never include private credentials, session cookies, or personal data in an issue or test fixture.

Please use the repository’s issue templates for bug reports and feature requests.

## 📄 License

See [`LICENSE`](LICENSE) for the license that applies to this project. Third-party credits and dependency information are documented in the repository.

---

<div align="center">
  <sub>Built for browser-extension experimentation, chess study, and permitted analysis. Respect fair-play rules and the terms of the platform you use.</sub>
</div>
