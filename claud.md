# FirstVid Project Handoff

Last updated: 2026-07-20

This file records where the FirstVid project currently stands so a new Codex/Claude session can resume without losing context.

## Project

- Name: FirstVid / First Principles Homework Helper
- Local folder: `C:\Users\torst\OneDrive\Documents\Kids Homework explainer`
- GitHub repo: `https://github.com/ptwgroup/firstvid-homework-helper`
- Current package version: `1.0.2`
- License: MIT / open source
- Latest saved commit at last check: `9112b57 Fix installed app API key recovery`

## Current Working State

- The repo was clean after the last save.
- FirstVid was rebuilt as a Windows desktop app using Electron.
- Installed local app path:
  `C:\Users\torst\AppData\Local\Programs\FirstVid\FirstVid.exe`
- User confirmed the app worked after the API key recovery fix.
- The current working version has been committed and pushed to GitHub.

## Important Security Note

- Do not commit API keys.
- Do not hardcode the xAI/Grok key into the public repo or installer.
- Project `.env` and installed app config are intentionally ignored by Git.
- Local project key file:
  `C:\Users\torst\OneDrive\Documents\Kids Homework explainer\.env`
- Installed app private key file:
  `C:\Users\torst\AppData\Roaming\FirstVid\.env`
- The installed app should use its private app-data `.env` so it can work on this computer without asking for the key every time.

## What Was Fixed Last

The last major fix was API key handling for the installed app:

- The installed app had an older/incomplete xAI key in `%APPDATA%\FirstVid\.env`.
- The full local key from the project `.env` was copied into the installed app private `.env`.
- Step 2 Grok analysis was tested successfully through the installed desktop app.
- The app now distinguishes:
  - missing key: `XAI_KEY_MISSING`
  - invalid/rejected key: `XAI_KEY_INVALID`
  - out of credits/spending limit: `OUT_OF_CREDITS`
  - temporary Grok/API trouble: `GROK_ANALYSIS_UNAVAILABLE`
- Invalid or missing keys now reopen the API key modal automatically.
- Service worker cache was bumped to `firstvid-v13`.
- Package version was bumped to `1.0.2`.

## Verified Tests

Run from the project folder:

```powershell
npm run check
```

Expected result:

```text
frontend, service worker, and manifest parse ok
```

Installed-app test that previously passed:

- App health returned OK.
- `xaiConfigured` returned `true`.
- Fresh Grok analysis returned `mode: ai`.
- Test subject detected: `Astronomy / Moon Phases`.

## Useful Commands

Start the local Node server:

```powershell
npm start
```

Run desktop app from source:

```powershell
npm run desktop
```

Build Windows installer/unpacked app:

```powershell
npm run dist:win
```

Run static checks:

```powershell
npm run check
```

Check Git status:

```powershell
git status --short
```

Push changes:

```powershell
git push
```

## App Architecture

- `index.html`: main frontend UI, single-page app.
- `server.js`: local Node HTTP server for API calls, xAI/Grok analysis, chat, video generation, caching, and static files.
- `desktop/main.js`: Electron wrapper. Starts `server.js` on a random free local port and opens the app window.
- `sw.js`: service worker cache for browser/PWA use.
- `images/`: storyboard frames/icons.
- `firstvid_demo.mp4`: local sample video fallback.
- `generated/`: local generated output; ignored by Git.
- `.firstvid-cache/`: local cache; ignored by Git.
- `dist/`: Electron build output; ignored by Git.

## Current Product Behavior

Step 1:

- Upload image, drag-and-drop image, use camera, or type/paste homework text/URLs.
- Written input is supported.

Step 2:

- Grok analysis is required.
- The app should not fall back to fake local analysis if Grok is unavailable.
- If credits are exhausted, it should clearly say so and should not start robotic read-aloud.
- Analysis is cached locally to avoid spending credits again for the same prompt.

Step 3:

- Local funny explainer is preferred immediately after analysis.
- Cinematic AI video is optional and can be generated separately.
- The local video/explainer still needs continued creative improvement.

Chat:

- Chat is meant to clarify the same subject with sharper follow-up explanations.
- It should not repeat the exact same wording as Step 2 or the video script.

## Open Product Direction

The user wants FirstVid to become:

- Fast enough that Step 2 feels like seconds, not waiting forever.
- Funny, warm, and sharp in the explanations.
- More audio/video led after analysis, not robotic browser read-aloud.
- Installable for Windows first, later iOS/Android.
- Open source so others can improve it.
- Eventually safe and trusted for broad download. Windows Smart App Control blocks unsigned builds; proper code signing is needed for public distribution.

## Known Issues / Next Work

1. Improve the local generated explainer so it is visually attractive and genuinely funny, while not imitating any living/deceased performer's exact voice.
2. Reduce analysis latency with tighter prompts, caching, and possibly a faster/lower-cost model for first pass.
3. Make video/explainer timing adaptive so it can explain harder subjects properly without a short arbitrary cap.
4. Improve chat answers so they diagnose what the learner did not understand and explain from a new angle.
5. Add proper Windows code signing before public download.
6. Investigate packaging paths for macOS/iOS/Android later. The current app is Windows/Electron plus browser/PWA pieces.
7. Consider release automation so `CHECKSUMS-SHA256.txt` and GitHub releases stay aligned with built installers.

## Restart Checklist

When resuming in a new session:

1. Open project folder:
   `C:\Users\torst\OneDrive\Documents\Kids Homework explainer`
2. Run:
   `git status --short`
3. Confirm latest commit:
   `git log -1 --oneline`
4. Run:
   `npm run check`
5. If testing Grok, confirm the installed app `.env` exists but do not print the key.
6. If rebuilding the desktop app, run:
   `npm run dist:win`
7. Keep `.env`, `.firstvid-cache/`, `generated/`, `dist/`, and `node_modules/` out of Git.

