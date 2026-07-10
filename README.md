# FirstVid

FirstVid, or First Principles Homework Helper, is a local homework explainer that captures a homework image or written task, explains it from first principles, and can optionally ask Grok for sharper analysis or a cinematic short clip.

The current design is Grok-required for new Step 2 analyses: FirstVid will not pretend it understood homework if Grok has no credits. Saved Grok analyses and the local Step 3 explainer still help reduce repeat credit use.

## Files

- `index.html` - frontend app, built with Tailwind CDN, Font Awesome CDN, and vanilla JavaScript.
- `server.js` - tiny local Node backend for xAI/Grok analysis and video generation.
- `package.json` - local start script.
- `.env.example` - local xAI configuration template.
- `firstvid_demo.mp4` - local fallback/sample video.
- `images/frame1.jpg` through `images/frame5.jpg` - fallback storyboard frames.
- `manifest.webmanifest` and `sw.js` - installable web app support.
- `generated/` - created automatically when AI videos are downloaded locally.
- `.firstvid-cache/` - created automatically for saved lessons and generated-video lookups. It is ignored by git.

## Best Local Run Mode

Use the Node server for real Step 2 and Step 3 behavior.

1. Create an xAI key in the xAI Console.
2. If you pasted a key into chat, revoke/rotate it and create a fresh one.
3. Save the key locally:

```bash
npm run setup:key
```

4. Start FirstVid:

```bash
npm start
```

5. Open:

```text
http://localhost:8788
```

Manual setup also works: copy `.env.example` to `.env`, then put your xAI key in `.env`:

```text
XAI_API_KEY=xai-your-real-key-here
```

Do not paste real keys into chat or commit `.env`.


The app will now:

- Serve the frontend locally.
- Keep your API key out of the browser.
- Send captured homework images, typed homework text, or pasted URLs to Grok for Step 2.
- Return structured first-principles explanation JSON.
- Start a local animated explainer immediately for Step 3, with Skit, Quiz, Deep Dive, and Remix modes.
- Offer Grok Imagine as an optional cinematic clip.
- Download generated videos into `generated/` when possible.
- Cache completed Grok lessons in `.firstvid-cache/lessons/` so repeated topics load instantly and use no new credits.
- Cache downloaded cinematic clips in `.firstvid-cache/videos/` when possible.

## Basic Offline Demo Mode

You can still double-click `index.html`, but real AI will not run from `file://`.

Offline/double-click mode supports:

- Upload/camera UI
- Demo examples
- Local demo explanations for built-in examples
- Local animated explainer, MP4 sample, and storyboard

Real new-homework analysis requires `npm start`, an xAI key, and available Grok credits.

## Camera Notes

Browser camera access usually requires a secure origin. Use:

- `http://localhost:8788`
- VS Code Live Server
- Any HTTPS local/dev host

If camera permission is denied, upload and demo flows still work.

## How Step 2 Works

`index.html` sends the homework image data URL and/or written text/URL to:

```text
POST /api/analyze-homework
```

`server.js` calls xAI Responses API with:

- Grok vision input when an image is provided
- typed homework text or URL context when provided
- Optional web search tool only for URLs/current-background requests
- Structured JSON schema
- A first-principles teaching prompt that avoids simply giving away final numerical answers

Before spending new credits, `server.js` checks the local lesson cache. If the same input already has a saved Grok analysis, FirstVid returns that explanation instantly.

If Grok is unavailable, out of credits, or the API key is missing, Step 2 shows a clear error and does not start read-aloud or a fake local analysis. New homework analysis requires Grok.

The frontend renders the returned JSON into:

- detected subject and problem
- building blocks
- analogy
- questions to think about
- try-it-yourself guidance
- video script
- storyboard captions

## How Step 3 Works

FirstVid uses a local canvas explainer as the default "video" experience. It is interactive, immediate, and can run for 50-90 seconds or more because it is generated in the browser, not by a paid video API. The child can switch styles:

- Skit - funny character walkthrough
- Quiz - pause-and-answer prompts
- Deep Dive - slower background and misconceptions
- Remix - playful alternate angle

The optional cinematic AI clip sends the Step 2 video prompt/script to:

```text
POST /api/generate-video
```

FirstVid now uses a local animated explainer as the default teaching video. It starts immediately, can run longer than the xAI video cap, and is built from the exact subject, problem, building blocks, analogy, questions, and try-it-yourself prompt.

For the optional cinematic clip, `server.js` builds a grounded video prompt from the exact subject, problem, building blocks, script, and storyboard captions. It then starts a Grok Imagine video generation job, polls until the video is ready, and tries to download the MP4 to:

```text
generated/firstvid_ai_<timestamp>.mp4
```

If cinematic video generation is unavailable, the local explainer still works. xAI currently allows 1-15 seconds per generated clip, so FirstVid chooses 8, 12, or 15 seconds automatically for optional cinematic clips based on topic complexity. Longer teaching time should come from the local interactive explainer, not repeated paid video calls.

## Credit-Saving Strategy

The best current route is:

1. Use Grok for every new Step 2 homework understanding pass.
2. Use the local canvas explainer automatically for Step 3 after Grok succeeds. It is instant, funny, longer than 15 seconds, and free.
3. Save every Grok explanation locally in `.firstvid-cache/lessons/`.
4. Save downloaded cinematic clips in `generated/` and reuse them through `.firstvid-cache/videos/`.
5. Later, publish the best generated explanations to a private/public video library or YouTube channel and map common subjects to those saved assets instead of regenerating.

## Configuration

Optional `.env` settings:

```text
XAI_ANALYSIS_MODEL=grok-4.5
XAI_VIDEO_MODEL=grok-imagine-video
FIRSTVID_VIDEO_SECONDS=auto
FIRSTVID_VIDEO_RESOLUTION=480p
FIRSTVID_VIDEO_TIMEOUT_MS=180000
PORT=8788
```

## Storyboard Frames

- `images/frame1.jpg` - Read the homework and name the tiny story.
- `images/frame2.jpg` - Make five clear friend groups.
- `images/frame3.jpg` - Place two cookies in each group.
- `images/frame4.jpg` - Turn the picture into repeated addition.
- `images/frame5.jpg` - Try the final count yourself.

## Safety Notes

- Do not paste API keys into chat.
- Do not commit `.env`.
- Local explainers start immediately and do not require video credits.
- Optional cinematic AI clips are 480p by default and saved locally when possible.
- xAI video URLs are temporary, so the server downloads them locally when possible.

## Installable App Notes

FirstVid includes a web app manifest and service worker, so it can be installed from supported browsers:

- Windows: open `http://localhost:8788` in Edge or Chrome, then use the install app button.
- Android: open in Chrome, then use “Add to Home screen” or the install prompt.
- Apple/iPhone/iPad: open in Safari, then use Share -> Add to Home Screen.

For a distributable desktop/mobile product, package the same frontend/backend idea with Tauri, Electron, Capacitor, or a hosted backend.

## Code Protection Reality

No browser-delivered frontend can be made impossible to inspect or copy. FirstVid protects the important secret by keeping `XAI_API_KEY` in the local/server backend, not in `index.html`. For a commercial downloadable app, use:

- server-side API keys only
- license/account checks on a backend
- code signing for desktop/mobile packages
- minification/obfuscation as friction, not true security
- usage quotas and revocable keys
