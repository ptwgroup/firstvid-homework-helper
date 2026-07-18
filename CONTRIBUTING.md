# Contributing to FirstVid

Thanks for helping improve FirstVid. The goal is a child-friendly homework explainer that makes ideas understandable without simply handing over final answers.

## Local Setup

```bash
npm install
npm run check
npm start
```

Open:

```text
http://localhost:8788
```

For desktop development:

```bash
npm run desktop
```

## API Keys

Never commit real API keys.

- Use `.env` for local server development.
- Use the in-app **API Key** button for the packaged desktop app.
- `.env`, generated videos, logs, and local caches are ignored by git.

## Pull Request Checklist

- Keep the app friendly, accessible, and clear for children.
- Do not add final-answer-only solving behavior.
- Keep Grok/xAI keys server-side or local-only.
- Run `npm run check` before opening a PR.
- For UI changes, test at tablet and desktop widths.

## Packaging

Windows installer:

```bash
npm run dist:win
```

iOS distribution requires either:

- hosted HTTPS PWA + Safari **Add to Home Screen**, or
- an Apple Developer account with App Store/TestFlight/enterprise signing.

Do not promise a sideloadable iOS app without Apple signing.
