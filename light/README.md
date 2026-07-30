# Light

A flashlight for the phone, as a small offline web app. Live at
[anderlejan.github.io/light/](https://anderlejan.github.io/light/).

## How it works

Two light sources:

- **Camera LED** — `getUserMedia` on the rear camera, then
  `track.applyConstraints({ advanced: [{ torch: true }] })`. Supported on Android
  Chrome/Edge and other Chromium browsers; iOS Safari does not expose the torch to
  web pages, so it falls back automatically.
- **Screen** — a full-screen layer with six colours and a brightness slider. Tap
  anywhere on the lit screen to switch it off.

Both sources drive the same three patterns: steady, strobe (1–15 Hz) and SOS in
morse. A screen wake lock is taken while the light is on, and the camera stream is
released the moment it goes off, so nothing keeps the camera busy in the background.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup |
| `style.css` | Styling |
| `app.js` | Torch/screen control, patterns, wake lock |
| `sw.js` | Cache-first service worker (offline launch) |
| `manifest.webmanifest` | Installable to the home screen |
| `icons/` | App icons |

No build step and no dependencies — plain static files served by GitHub Pages.
The camera LED needs HTTPS (or `localhost`); the screen lamp works anywhere.
