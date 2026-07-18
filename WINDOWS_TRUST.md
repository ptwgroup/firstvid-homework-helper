# Windows SmartScreen and Code Signing

FirstVid v1.0.0 is open source and currently distributed as an unsigned Windows installer.

Windows SmartScreen may show a warning such as:

- "Windows protected your PC"
- "Unknown publisher"
- "This app is not commonly downloaded"

This warning does not automatically mean the app is malicious. It usually means the installer has not been signed by a trusted publisher and has not built Microsoft SmartScreen reputation yet.

## How Users Can Verify the Current Installer

Download from the official release page:

```text
https://github.com/ptwgroup/firstvid-homework-helper/releases/tag/v1.0.0
```

Expected SHA-256 for `FirstVid.Setup.1.0.0.exe`:

```text
E82EA02B0CF92B3F7596C8D0187B17AF062EF042F8EBE4DD8DA8F4D4A9EF522F
```

Verify on Windows PowerShell:

```powershell
Get-FileHash ".\FirstVid.Setup.1.0.0.exe" -Algorithm SHA256
```

The hash should match exactly.

## How To Remove SmartScreen Warnings Broadly

For public distribution, FirstVid needs one of these:

1. A Windows code-signing certificate from a trusted Certificate Authority.
2. Microsoft Store distribution.

Best practical route:

1. Buy an OV or EV code-signing certificate for the publisher.
2. Configure Electron Builder signing.
3. Rebuild the installer.
4. Publish the signed installer as a new GitHub release.

EV certificates usually build SmartScreen trust faster, but they cost more and require stricter identity verification.

## Why We Cannot Fix This Only In Code

SmartScreen trust is controlled by Microsoft and Windows. A code change inside FirstVid cannot make an unsigned installer appear as a known trusted publisher. The app needs a verifiable publisher signature or Store distribution.

## Current Safety Measures

- Source code is public under the MIT License.
- The real API key is not bundled into the app.
- Users add their own xAI key locally.
- `.env`, logs, generated videos, and cache files are ignored by git.
- Release checksums are published.
