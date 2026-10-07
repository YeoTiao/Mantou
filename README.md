# Exchange Companion

An all-in-one app for an exchange semester at IE University in Madrid: budget and bill splitting, trips, flights, places to stay, timetable, deadlines, the IE 2026–27 calendar, a document wallet, packing lists, emergency info, saved places and a journal.

It's a website you add to your home screen. It works the same on iPhone and Android, and it opens offline.

- **Your own data** (budget, timetable, documents, notes) is saved on your phone only. Use **More › Settings › Export backup** now and then, and **Import backup** to move to a new phone.
- **Shared trips** are stored online so friends can see them. Friends join from an invite link. They don't need an account or an app store.

## Put it online with GitHub Pages

1. In this repository on GitHub, go to **Settings › Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then pick `main` and `/ (root)`, and save.
3. After a minute the app is live at `https://<your-username>.github.io/<repo-name>/`.

To install it on a phone, open that link:
- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap the ⋮ menu, then **Add to Home screen** or **Install app**.

## Switch on shared trips (free Firebase project, about 10 minutes)

Without this step everything works except the **Travel › With friends** tab.

1. Go to https://console.firebase.google.com, click **Create a project**, and give it a name. Google Analytics isn't needed.
2. **Build › Authentication › Get started › Sign-in method:** turn on **Anonymous**.
3. **Build › Firestore Database › Create database:** pick a location near you, such as `eur3` or `europe-southwest1` (Madrid), and start in **production mode**.
4. In Firestore, open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
5. **Project settings (gear icon) › General › Your apps:** click the web icon `</>`, register an app (no hosting needed), and copy the `firebaseConfig` values.
6. Paste them into [`config.js`](config.js) so it reads `window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", appId: "..." };` and commit.
7. **Authentication › Settings › Authorized domains:** add `<your-username>.github.io`.

The Firebase config isn't a password: it's meant to be public. The rules in `firestore.rules` are what keep trips private to the people invited.

The free Spark plan is far more than a group of friends will use.

## How sharing works

- Each phone gets an anonymous ID the first time it opens the app.
- Starting a shared trip makes you its first member. **Invite friends** sends a link. Opening it adds that phone to the trip.
- Members can add plans and expenses, see who owes who, and mark payments as settled.
- Anyone holding a trip's invite link can join it, so send the link only to the people going.
- If someone clears their browser data or changes phone, they open the invite link again to rejoin.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app |
| `config.js` | Your Firebase settings (empty by default) |
| `firestore.rules` | Database security rules for shared trips |
| `manifest.webmanifest`, `icons/` | Home-screen name and icon |
| `sw.js` | Offline support |

The IE calendar dates come from IE's published 2026–27 academic calendar, which notes that dates may change. Segovia-only holidays are left out.
