# One Tap Request

One Tap Request is a personal one-button PWA and Capacitor Android app. Hold the button for one second and it sends a push notification through a Vercel Serverless Function and the OneSignal REST API.

## Notification

Title: `❤️ Request Received`

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

1. Create a OneSignal app with Android push configured.
2. Copy `.env.example` values into Vercel Environment Variables.
3. Set `ONESIGNAL_APP_ID`.
4. Set `ONESIGNAL_API_KEY` to the private OneSignal App API key.
5. Set `ONESIGNAL_SUBSCRIPTION_ID` to the Android device subscription ID.
6. Deploy to Vercel.

The frontend never receives the OneSignal API key. Push delivery is handled only by `/api/request`.

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
set ONESIGNAL_APP_ID=your-onesignal-app-id
npm run sync:android
npm run android
```

Build from Android Studio after Capacitor opens the generated Android project. The generated package id is `com.onetaprequest.app`. The Android project initializes the native OneSignal SDK from `ONESIGNAL_APP_ID`, requests notification permission, and registers the installed app as a push subscription.

## Security

The API accepts POST requests only, validates JSON payload shape, rejects oversized bodies, checks request timestamps, supports origin locking through `PUBLIC_APP_ORIGIN`, and rate limits requests to one every 30 seconds per client IP.
