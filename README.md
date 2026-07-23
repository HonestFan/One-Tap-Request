# One Tap Request

One Tap Request is a personal one-button PWA and Capacitor Android app. Hold the button for one second and it sends a Gmail email request through a Vercel Serverless Function and EmailJS.

## Email

Subject: `❤️ Request Received`

Body: `She needs you.`

## Project Structure

```text
/
index.html
styles.css
script.js
manifest.json
service-worker.js
icons/
api/request.js
package.json
vercel.json
capacitor.config.ts
.env.example
```

## Vercel Setup

1. Create or open your EmailJS account.
2. Connect Gmail as an EmailJS email service.
3. Create an EmailJS template that uses `{{to_email}}`, `{{subject}}`, and `{{message}}`.
4. Copy `.env.example` values into Vercel Environment Variables.
5. Set `EMAILJS_SERVICE_ID`.
6. Set `EMAILJS_TEMPLATE_ID`.
7. Set `EMAILJS_PUBLIC_KEY`.
8. Set `EMAILJS_PRIVATE_KEY`.
9. Set `REQUEST_RECIPIENT_EMAIL` to the Gmail address that should receive the request.
10. Deploy to Vercel.

The frontend never receives EmailJS keys. Email delivery is handled only by `/api/request`.

## Local Development

```bash
npm install
npm run dev
```

Open the Vercel dev URL and hold the button for one second.

## PWA Install

The app includes a web manifest, SVG icons, service worker caching, offline shell support, and a deferred install prompt. After the first successful request, supported browsers may show the install prompt.

## Android

```bash
npm install
npm run sync:android
npm run android
```

Build from Android Studio after Capacitor opens the generated Android project. The generated package id is `com.onetaprequest.app`. Email delivery still goes through the deployed Vercel API, so no email credentials are stored in the Android app.

## Security

The API accepts POST requests only, validates JSON payload shape, rejects oversized bodies, checks request timestamps, supports origin locking through `PUBLIC_APP_ORIGIN`, stores EmailJS credentials only in Vercel environment variables, and rate limits requests to one every 30 seconds per client IP.
