# ADDA — Fresh Build Guide (follow in order, top to bottom)

## Part 0 — How this zip works (read this first)

This zip is an **overlay**, not a standalone project. You create a fresh
project with Expo's official tool, then drop these files on top. That is
deliberate: the zip contains **NO package.json, index.js, or
babel.config.js** — those must come from the official template so the
build system always matches the current SDK. This is exactly what fixed
your Metro errors before.

**Golden rule forever:** `src\` and `App.js` travel between projects;
`package.json`, `node_modules`, and your Firebase keys never get
overwritten.

What IS in the zip:
- `App.js` — root component (auth gates, tabs, navigation)
- `src\` — all screens, theme, utils
- `assets\` — your app icon + Android adaptive icon
- `app.json` — app name/package/icon/plugins config
- `eas.json` — APK + Play Store build profiles
- `firestore.rules` — security rules to paste into Firebase Console
- `firebaseConfig.js` — with PLACEHOLDERS; you paste your real keys in Part 4
- `README.md` — full feature/reference docs

---

## Part 1 — Prerequisites (once per computer)

1. **Node 22 LTS** — check with `node -v`; must be 20.19 or newer.
   If not: install from https://nodejs.org (LTS button), then reopen PowerShell.
2. **Expo Go** app installed on your Android phone (Play Store).
3. Free accounts: https://console.firebase.google.com and https://expo.dev

---

## Part 2 — Scaffold the project and drop the files in

Extract this zip somewhere (example below assumes `Downloads\adda-files`).
Then in PowerShell:

```powershell
cd C:\projects
npx create-expo-app@latest adda --template blank
Copy-Item $HOME\Downloads\adda-files\* -Destination .\adda\ -Recurse -Force
cd adda
```

The `-Force` overwrites the template's starter `App.js` and `app.json`
with Adda's — that's correct and expected.

---

## Part 3 — Install Adda's libraries

Still inside `C:\projects\adda`:

```powershell
npx expo install expo-font expo-image-picker expo-image-manipulator expo-linear-gradient expo-constants react-native-screens react-native-safe-area-context @react-native-async-storage/async-storage @expo/vector-icons
```

```powershell
npm install firebase @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs @expo-google-fonts/fraunces @react-native-google-signin/google-signin
```

Why two commands: `npx expo install` picks the exact versions your SDK
expects for Expo-managed packages; plain `npm install` is for the
SDK-independent ones.

---

## Part 4 — Firebase (about 7 minutes, all on the free plan)

You can reuse your existing Firebase project (skip to step 3 and just
copy the config) or create a new one:

1. https://console.firebase.google.com → **Add project** → name `adda`
   (disabling Google Analytics is fine).
2. Gear icon → **Project settings** → *Your apps* → click the **`</>`
   (Web)** icon → nickname `adda` → Register. (Web is correct even for an
   Android app — the Firebase JS SDK uses the web config.)
3. It shows a `firebaseConfig` object. Open `firebaseConfig.js` in the
   project and replace the placeholder values with yours (apiKey,
   authDomain, projectId, storageBucket, messagingSenderId, appId).
   *(Already have a project? Project settings → Your apps → your web app
   → "Config" shows the same object.)*
4. Left sidebar → **Build → Authentication** → Get started →
   **Sign-in method** tab → enable **Email/Password**.
5. On the same page, enable **Google** too. Expand it and copy the
   **Web client ID** → paste it into `GOOGLE_WEB_CLIENT_ID` at the bottom
   of `firebaseConfig.js`. (The Google button only functions in the APK,
   not Expo Go — but set this up now so the APK works later.)
6. **Build → Firestore Database** → Create database → location
   `asia-south1 (Mumbai)` → **production mode**.
7. Firestore → **Rules** tab → select everything → paste the full
   contents of `firestore.rules` from the project → **Publish**.
   Skipping this breaks reactions, comments, notifications, and chats
   with "Missing or insufficient permissions".

---

## Part 5 — Run it on your phone

```powershell
npx expo start -c
```

Phone and PC on the same Wi-Fi → scan the QR with Expo Go.
If it hangs connecting: `npx expo start --tunnel`

First run flow: **Create account** → verification email arrives (check
spam) → click the link → back in the app tap **"I've verified —
continue"** → set up your profile → you're in.

---

## Part 6 — Test checklist

- Feed top-right: **filter** (pick "Photos only"), **bell**, **+** (post
  something from the sheet)
- On a post: **React** → pick an emoji → tap "see who reacted" → change
  your reaction
- **💬** → leave a comment (count updates live)
- Discover: **chat-bubble** button on any card → instant conversation, no
  matching needed; **heart** → mutual heart still triggers "It's a match!"
- Second account (friend's phone, or sign out/in): react to account A's
  post → A's bell shows a badge → Notifications screen lists it
- **Google button in Expo Go** → shows "works in the APK" message; that
  IS the correct behavior in Expo Go

---

## Part 7 — Build the APK for friends

```powershell
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

The `preview` profile in `eas.json` produces an installable **APK** and
gives you a shareable download link when the cloud build finishes.

**To make the Google button work in the APK** (one time):

```powershell
eas credentials
```

→ Android → Keystore → copy the **SHA-1** fingerprint. Then Firebase
Console → Project settings → **Add app → Android** → package
`com.nabib.adda` → paste the SHA-1 → Register. (No google-services.json
needed — registering just creates the OAuth client Google requires.)
Rebuild the APK after this.

Play Store later: `eas build -p android --profile production` (AAB),
Play Console account ($25 one-time), privacy policy URL, data-safety
form, content rating (dating → Mature 17+). The in-app "Delete account"
Play requires is already built into the Profile tab.

---

## Part 8 — Troubleshooting

- **"Project is incompatible with this version of Expo Go"** →
  `npx expo install expo@latest` then `npx expo install --fix`, restart
  with `npx expo start -c`.
- **"Unable to resolve <package>"** → `npx expo install <package>`,
  restart with `-c`.
- **"Missing or insufficient permissions"** → Part 4 step 7 not
  published. Re-paste the rules and Publish.
- **Metro "transformFile" / bundler weirdness** → delete `node_modules`
  and `package-lock.json`, `npm install`, `npx expo start -c`. Never copy
  a `package.json` from anywhere into this project.
- **Firestore says "client is offline"** → in `firebaseConfig.js` replace
  `getFirestore(app)` with:
  `initializeFirestore(app, { experimentalForceLongPolling: true })`
  (import `initializeFirestore` from 'firebase/firestore').
- **Verification email never arrives** → check spam; "Resend" has a 60s
  cooldown; Firebase free tier limits sends per day, so don't spam it.
- **Everyone shows "Away" in Discover** → Active status only updates
  while someone has the app open (heartbeat every 4 min, "Active" = seen
  within 10 min).
