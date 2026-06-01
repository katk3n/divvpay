# DivvPay 💸

**DivvPay** is a premium standalone Google Apps Script (GAS) Web Application designed to reconcile split expenses among a dynamic group of friends ($N$-members). By utilizing Google Sheets as a secure, decentralized database and executing actions under the user's accessing credentials, DivvPay ensures data ownership while offering a fluid, sleek user experience.

---

## ✨ Features

- **Space-Dark Glassmorphism UI**: Built with pure vanilla CSS, featuring vibrant gradients, clean glass cards, smooth transitions, and premium micro-interactions.
- **Standalone & Multi-Group Support**: Fully parameter-driven via URL query strings (`?id=SPREADSHEET_ID`). A single deployed Web App URL can manage different friend groups and trips simply by changing the sheet ID.
- **Automated Onboarding & Self-Healing Database**: 
  - If no ID is provided, an elegant onboarding view guides users to either automatically initialize a new spreadsheet under their own Google Drive or paste an existing Sheet URL/ID.
  - Backend tables (`expenses`, `settlements`, `members`, `categories`) automatically self-heal and initialize if sheets are missing.
- **ID-Based Member References (Primary/Foreign Key Design)**: Ensures 100% data consistency. Renaming a member instantly updates across the UI without modifying any database cells.
- **Advanced Custom Split Ratios**: Adjust cost burdens using dynamic sliders. Includes real-time sum validation (sums to 100%) and automatic mutual adjustment for 2-member groups.
- **Optimal Settlement Engine**: Implements a greedy matching algorithm to calculate the absolute minimum number of bank/cash transfers needed to clear all debts.
- **Local Sandbox / Mock Mode**: Double-clicking `dist/index.html` locally triggers an offline Mock Mode utilizing `localStorage`, allowing developers to test features without any GAS connection.

---

## 🔒 Security Architecture

DivvPay prioritizes data safety and privacy through rigorous engineering practices:
1. **Google Drive ACL Enforcement (`USER_ACCESSING`)**: Deployed to execute under the accessing user's context. Only users explicitly invited via Google Sheets sharing can view or modify data.
2. **Formula Injection (CSV Injection) Prevention**: To thwart malicious formulas (e.g., `=IMPORTXML`) from harvesting spreadsheet data, a backend sanitization layer (`sanitizeTextInput`) prefixes cells starting with `=`, `+`, `-`, or `@` with a single quote `'`.
3. **Cross-Site Scripting (XSS) Mitigation**: All dynamic outputs render securely via an `escapeHTML` helper, and critical UI labels utilize browser-safe `textContent` bindings instead of raw HTML insertion.
4. **No External Dependecies / Eval**: Runs completely on vanilla JS, avoiding the safety risks associated with dynamic evaluation (`eval`) or bloated NPM frameworks.

---

## 📂 Project Structure

```text
├── build.js             # Inline compiler to bundle CSS/JS into a single index.html
├── package.json         # Build configuration and scripts
├── dist/
│   └── index.html       # Compiled, self-contained single-page application (SPA)
└── src/
    ├── appsscript.json  # GAS Web App configuration manifest
    ├── Code.js          # GAS Backend (Server-side API handlers)
    ├── index.html       # Frontend structure and layout
    ├── stylesheet.html  # Premium HSL Space-Dark Glassmorphism styling
    └── javascript.html  # Client-side SPA engine and Local Storage Mock handler
```

---

## 🛠️ Getting Started (Local Development)

### 1. Compile Frontend Assets
To compile `src/stylesheet.html` and `src/javascript.html` into the single-file distribution inside `dist/index.html`, run:
```bash
# Install development scripts
npm install

# Bundle the files
node build.js
```

### 2. Run Mock Environment
Open `dist/index.html` in any web browser. Because the origin is local (e.g., `file://`), DivvPay will automatically boot into **Mock Storage Mode**. 
- Add mock members, define categories, register expenses, and test settlements locally.
- All mock data resides inside your browser's `localStorage` and is isolated per Spreadsheet ID.

---

## 🚀 Deployment to Google Apps Script

To deploy DivvPay live:

### Option A: Using clasp (Recommended)
1. Initialize a standalone GAS script on Google Drive:
   ```bash
   npx @google/clasp create --title "DivvPay" --type standalone
   ```
2. Copy `src/appsscript.json` and push files:
   ```bash
   npx @google/clasp push
   ```

### Option B: Copy-Paste Method
1. Create a new **Standalone Script** at [script.google.com](https://script.google.com/).
2. Create two files in the editor:
   - `Code.js` (Paste the contents of `src/Code.js`)
   - `index.html` (Paste the compiled content of `dist/index.html` — **not `src/index.html`!**)
3. Save the project.

### Web App Deployment Settings
When deploying the web app (Deploy > New deployment > Web app):
- **Execute as**: `User accessing the web app` (Enforces security ACLs)
- **Who has access**: `Anyone`