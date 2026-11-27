# KidSafe Start

A Chrome extension plus a parent dashboard for managing a kid's browsing.

| What you get | Where it lives |
|---|---|
| **Kid's welcome page**: replaces Chrome's new tab with big, friendly tiles grouped into sections (✨ New, 📚 Email & School, 🧠 Learning, 🎮 Games, 🎬 Videos & Music, 🎨 Create, ⭐ More) | `extension/` |
| **Allow-list blocking**: any site you have not approved shows a friendly "not on your list yet" page with an **Ask to allow** button | `extension/` |
| **Usage tracking**: how long each website was open and in front, plus a visit-by-visit timeline | `extension/` |
| **Parent dashboard** (works on your phone): see usage, see blocked sites and requests, add/edit/remove allowed sites from anywhere | `parent/` |

Changes you make in the dashboard reach your kid's Chrome within about a minute. Usage reaches the dashboard within about a minute too.

---

## How it works

```
 Kid's Chrome (extension)  <-->  Firebase Firestore (free)  <-->  Parent dashboard (any browser)
   - tracks time per site          - your allow-list               - view usage
   - blocks unlisted sites         - daily usage reports           - add allowed sites
   - welcome page                                                   - approve requests
```

The extension and the dashboard both talk to a small free Firebase database that you own. Nothing goes to any other server.

---

## Setup (about 15 minutes, one time)

### 1. Create the free Firebase database

1. Go to <https://console.firebase.google.com> and click **Create a project** (any name, e.g. `kidsafe-family`). You can turn Google Analytics off.
2. In the left menu open **Build → Firestore Database → Create database**. Pick a location near you and start in **production mode**.
3. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.
4. Click the gear icon → **Project settings**. Note the **Project ID**.
5. Still in Project settings, under **Your apps**, click the **</>** (Web) icon, give it any nickname, and register it. Copy the **apiKey** value (starts with `AIza`). You do not need the rest of the snippet.

The free "Spark" plan is plenty: the extension uses about 1,500 reads and 1,500 writes per day; the free limit is 50,000 / 20,000.

### 2. Open the parent dashboard

The dashboard is a static page. Once this branch is merged into `main`, GitHub Pages serves it at:

**`https://sanemlegresley-source.github.io/kidsafe/parent/`**

(It is not linked from the portfolio home page and is marked `noindex`.) You can also open `parent/index.html` from any static host.

1. Choose **Create new family**, enter the Project ID, the API key, and your kid's first name, then click **Create family**.
2. Go to **Settings** and copy the **setup code** (starts with `KS1.`).

To use the dashboard on another device (e.g. your phone), open the same URL and choose **I have a setup code**.

### 3. Install the extension on your kid's Chrome

1. Download this folder to the kid's computer (on GitHub: **Code → Download ZIP**, then unzip).
2. In Chrome open `chrome://extensions`, switch on **Developer mode** (top right), click **Load unpacked**, and select the `kidsafe/extension` folder.
3. The **KidSafe parent settings** page opens automatically. Paste the setup code, choose a **parent PIN**, and click **Save & connect**. You should see "✅ Connected".
4. Open a new tab: the welcome page appears.

### 4. Lock it down (important)

A browser extension can be switched off by anyone who uses the computer, so close the obvious gaps:

- **Give your kid their own Chrome profile or computer account without admin rights.**
- **Turn off Incognito and Guest mode**, and stop the extension from being removed. The reliable way is Chrome policy:
  - *Windows*: Group Policy (`IncognitoModeAvailability = 1`, `BrowserGuestModeEnabled = false`, and add the extension to `ExtensionInstallForcelist` once it's published) or the registry equivalents.
  - *Mac*: a configuration profile with the same policy names.
  - *Chromebook / Google account for kids*: Google Family Link already blocks Incognito; you can also manage extensions there.
- **Block other browsers** (Edge, Firefox, Safari) with the OS's parental controls, or they bypass all of this.
- For force-install (cannot be removed), publish the extension to the Chrome Web Store as **Unlisted** (one-time $5 developer fee) and add its ID to `ExtensionInstallForcelist`.

---

## Using the dashboard

- **📊 Usage**: time online, sites used, and blocked attempts for any of the last 14 days; time per website; a 7-day chart (click a day to jump to it). The dot at the top right shows whether the kid's browser is online right now.
- **🕒 Activity**: every visit with start time, site, page title, and duration.
- **🙋 Requests**: sites your kid tried to open that aren't allowed. "Asked" means they clicked *Ask to allow*. **Allow** pre-fills the add-site form; **Dismiss** hides it.
- **🌐 Allowed sites**: add, edit, or remove sites.
  - **Section** decides where the tile appears on the welcome page.
  - **Icon** is optional: leave blank for the site's own logo, or use an emoji (🦖) or an image URL.
  - **Also allow these domains** is for sites that need helper domains to load or sign in. Gmail and Classroom already include `accounts.google.com`. If a site you allowed shows the "not on your list" page during sign-in, check **Requests** for the domain it tried and add it here.
  - Sites you add appear in the **✨ New** section (and get a NEW badge) for 7 days.
- **⚙️ Settings**: kid's name, the "block everything not on the list" switch (turn off to only track usage), and the setup code.

## Privacy and security

- Usage data is stored only in your Firebase project.
- Each family lives under a random 24-character ID inside the setup code. The rules let anyone who has that exact code read and write that family, but nobody can list or guess families. **Treat the setup code like a password.** If it leaks, create a new family and re-pair the extension.
- The parent PIN protects the extension's settings page on the kid's computer.

## What counts as "time"

Time is counted only while a website is the active tab of the focused Chrome window and the computer has been used in the last 60 seconds. Audio or video playing in a background tab is not counted. Each one-minute slice is capped at two minutes so a sleeping laptop never inflates the numbers.

## Files

```
kidsafe/
├── firestore.rules        Security rules to paste into Firebase
├── extension/             Load this folder in chrome://extensions
│   ├── manifest.json
│   ├── background.js      Time tracking, blocking rules, sync
│   ├── shared.js          Firestore REST client + shared helpers (same file as parent/shared.js)
│   ├── newtab.html/.js    The kid's welcome page
│   ├── blocked.html/.js   "Not on your list yet" page with Ask button
│   ├── options.html/.js   PIN-protected pairing page
│   └── pages.css, icons/
└── parent/                The parent dashboard (static site)
    ├── index.html, app.js, style.css
    └── shared.js
```
