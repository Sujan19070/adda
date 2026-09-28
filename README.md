# Adda — dating app (React Native + Expo + Firebase)

One JavaScript codebase → native Android and iOS. Test in **Expo Go** on your phone, build an **APK** for friends, then ship an **AAB** to the Play Store.

Four bottom tabs: **Feed · Discover · Chats · Profile**.

Feature set in this MVP:

- Email/password auth with persistent login (Firebase Auth)
- Profile setup: photo, name, age (18+ enforced), gender, preference, bio, hometown, current location, university, job
- **Feed**: post text or photos to everyone, filter by post type, like posts
- **Discover**: directory of ALL members with live Active/Away status, filterable by status, hometown, location, university, and job; ♥ a member — mutual likes create a match ("It's a match!" screen)
- **Chats**: real-time 1-to-1 messaging with everyone you've matched
- **Profile**: view/edit profile, sign out, delete account (Play Store requires deletion)
- Presence heartbeat: `lastActiveAt` updates every 4 minutes while the app is open; Discover shows "Active" for members seen in the last 10 minutes

Profile photos are compressed and stored as base64 inside Firestore documents, so you do **not** need Firebase Storage or a billing plan. Everything runs on the free Spark plan.

---

## 1. Prerequisites

- Node.js LTS (18+) installed on Zeus or Robot
- **Expo Go** app installed on your Android phone (Play Store)
- A free Firebase account and a free Expo account (expo.dev)

## 2. Install dependencies

```bash
cd dil-dating-app
npm install
npx expo install --fix   # aligns every native package with your Expo SDK
```

`npx expo install --fix` is important — it rewrites package versions to exactly what your installed Expo SDK expects, so run it after the first `npm install` and any time Expo warns about version mismatches.

## 3. Set up Firebase (one time, ~5 minutes)

1. Go to https://console.firebase.google.com → **Add project** → name it `adda` (Google Analytics optional — you can disable it).
2. In the project, click the gear → **Project settings** → under *Your apps* click the **`</>` (Web)** icon → register an app named `adda`. Yes, a **Web** app — the Firebase JS SDK uses the web config even inside React Native.
3. Copy the `firebaseConfig` object it shows and paste the values into **`firebaseConfig.js`** in this project (replace the placeholders).
4. Left sidebar → **Build → Authentication** → *Get started* → **Sign-in method** tab → enable **Email/Password**.
5. Left sidebar → **Build → Firestore Database** → *Create database* → choose location `asia-south1 (Mumbai)` (closest to Dhaka) → **Start in production mode**.
6. In Firestore, open the **Rules** tab, replace everything with the contents of **`firestore.rules`** from this project, and click **Publish**.

That's the entire backend. No servers, no billing.

## 4. Run it on your phone (Expo Go)

```bash
npx expo start
```

Make sure your phone and computer are on the same Wi-Fi, then scan the QR code with Expo Go. If the connection stalls on hotel/university Wi-Fi, run `npx expo start --tunnel` instead.

**Testing matches by yourself:** create two accounts (e.g. sign up, set up a profile, sign out, sign up again with another email). Make sure the genders/preferences are compatible, swipe right on each other from both accounts, and the match + chat will fire. Even easier: put the second account on a friend's phone with Expo Go.

## 5. Build an APK to share with friends

```bash
npm install -g eas-cli
eas login                     # your expo.dev account
eas build -p android --profile preview
```

The `preview` profile in `eas.json` is already set to produce an **APK** (not AAB). The build runs on Expo's servers (free tier queue) and gives you a download link when done — send that link straight to your friends, they tap it on Android and install. They may need to allow "install from unknown sources".

## 6. Launch on the Play Store

1. Build a production **AAB**: `eas build -p android --profile production`
2. Create a Google Play Console developer account (one-time $25 fee).
3. Create the app in Play Console, upload the AAB (or automate with `eas submit -p android`).
4. Things Play will require from you, especially as a **dating app**:
   - A **privacy policy URL** (host a simple page; free options: GitHub Pages, Notion).
   - The **Data safety** form — declare that you collect email, name, photos, messages.
   - **Content rating** questionnaire — dating apps get Mature 17+.
   - An in-app way to **delete the account** — already built into the Profile tab.
   - App icon (512×512), feature graphic (1024×500), and at least 2 screenshots.
5. Start with **Internal testing** or **Closed testing** track, then promote to production. Note: new personal developer accounts must run a closed test with a number of testers for a couple of weeks before production access — your friends with the APK are perfect testers for this.

For each new store upload, bump `version` and `versionCode` in `app.json` (production builds auto-increment via `eas.json`).

## New in this version

- **Email verification (real):** signup sends a Firebase verification email; the app is locked behind a "Verify your email" screen until the link is clicked. Google accounts skip it (already verified).
- **Google Sign-In:** see setup below. Works in the EAS APK / dev build; inside Expo Go the button explains itself (native module unavailable there).
- **Feed toolbar (top-right):** filter (post type), notification bell with unread badge, and a + button that opens the post composer.
- **Reactions:** ❤️ 👍 😂 😮 😢 with a picker, plus a "see who reacted" sheet.
- **Comments:** comment sheet on every post with live updates and counts.
- **In-app notifications:** reactions, comments, and matches notify the recipient (bell → Notifications screen, auto-marks read).
- **Open messaging:** the chat-bubble button on any Discover card starts a direct conversation — no friend request or matching needed. Hearts and "It's a match!" still exist as a fun layer on top.

## Google Sign-In setup (one time)

1. Firebase Console → **Authentication → Sign-in method → Google** → Enable. Copy the **Web client ID** shown there and paste it into `GOOGLE_WEB_CLIENT_ID` in `firebaseConfig.js`.
2. Install the package: `npm install @react-native-google-signin/google-signin` (already listed in package.json here).
3. For the APK to work: get your keystore's SHA-1 with `eas credentials` (Android → Keystore), then Firebase Console → Project settings → **Add app → Android**, package `com.nabib.adda`, paste the SHA-1. (No google-services.json needed — the Firebase JS SDK doesn't use it; registering the app just creates the OAuth client Google requires.)
4. Rebuild: `eas build -p android --profile preview`. Expo Go can't run this button (native code); email login covers testing there.

## Project structure

```
App.js                        # auth gating + navigation (tabs, chat, edit)
index.js                      # Expo entry point
firebaseConfig.js             # ← paste your Firebase keys here
firestore.rules               # ← paste into Firebase Console → Firestore → Rules
eas.json                      # APK (preview) and AAB (production) build profiles
src/
  theme.js                    # colors + fonts (jaam/shiuli palette)
  screens/
    LoginScreen.js            # sign in
    SignupScreen.js           # create account
    ProfileSetupScreen.js     # first-time setup AND edit profile
    FeedScreen.js             # composer + post feed with type filter and likes
    DiscoverScreen.js         # all-members directory, status + attribute filters,
                              # like button, match detection + modal
    ChatsScreen.js            # conversation list with last-message preview
    ChatScreen.js             # real-time chat
    MyProfileScreen.js        # view profile, sign out, delete account
  utils/photo.js              # pick + crop + compress photos → base64
```

## Firestore data model

```
users/{uid}
  name, age, gender ('man'|'woman'|'other'),
  interestedIn ('man'|'woman'|'everyone'), bio,
  hometown, location, university, job,
  photoBase64, lastActiveAt, updatedAt

posts/{postId}
  authorId, authorName, authorPhoto, type ('text'|'photo'),
  text, photoBase64, commentCount,
  reactions: { uid: { type: 'love'|'like'|'haha'|'wow'|'sad', name } },
  createdAt
posts/{postId}/comments/{commentId}
  authorId, authorName, text, createdAt
users/{uid}/notifications/{notifId}
  type ('reaction'|'comment'|'match'), text, postText?, fromId, read, createdAt

swipes/{swiperId_targetId}
  swiperId, targetId, liked (bool), createdAt
  → mutual-like check is a single doc read: swipes/{targetId_swiperId}

matches/{uidA_uidB}          # ids sorted, joined with "_"
  users: [uidA, uidB], profiles: { uid: {name, photoBase64} },
  lastMessage, lastMessageAt, createdAt

matches/{id}/messages/{msgId}
  senderId, text, createdAt
```

## Troubleshooting

- **"Project is incompatible with this version of Expo Go"** — your Expo Go app is newer than the project SDK. Run `npx expo install expo@latest` then `npx expo install --fix`, restart with `npx expo start -c`.
- **`getReactNativePersistence` import error** — some Firebase versions move this export. Try `import { getReactNativePersistence } from 'firebase/auth/react-native';` in `firebaseConfig.js` instead.
- **"Missing or insufficient permissions"** — you didn't publish `firestore.rules`, or you edited them. Re-paste and Publish.
- **Firestore says "client is offline" on Android** — some networks block Firestore's streaming transport. In `firebaseConfig.js`, replace `getFirestore(app)` with:
  ```js
  import { initializeFirestore } from 'firebase/firestore';
  export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
  ```
- **Everyone shows as "Away" in Discover** — Active status comes from the `lastActiveAt` heartbeat, which only writes while the app is open. Open the app on the other account and it flips to Active within seconds. To re-test matching, delete the relevant docs in the `swipes` collection in Firebase Console.
- **QR scan connects then hangs** — use `npx expo start --tunnel`.

## Sensible next steps (after MVP)

- Multiple photos per profile (move to Firebase Storage once you enable billing, or keep 2–3 small base64 images)
- Unmatch/block + report (Play policy will eventually expect reporting for dating apps)
- Push notifications for new matches/messages (`expo-notifications` — needs a development build, not Expo Go)
- Location-based filtering (store city or geohash on the profile)
- Pagination of the candidate pool once you pass a few hundred users
# adda
