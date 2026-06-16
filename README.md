# World Cup 2026 - Continental Federation Standings

A beautiful, minimalistic, and glassmorphic dark-themed web application that fetches the FIFA World Cup 2026 Group Stage fixtures and aggregates live performance metrics consolidated by continental federations (**UEFA**, **CONCACAF**, **CONMEBOL**, **CAF**, **AFC**, and **OFC**).

## 🏆 Key Features

- **Consolidated Federation Standings**: Aggregates and ranks the 6 FIFA Confederations based on the combined match performance of all their qualified countries in the group stage.
- **World Cup Group Standings**: A detailed group-by-group standings layout (Groups A to L) with standard rankings based on points, goal difference, and goals scored.
- **Interactive Matches Feed**: Scrollable list of matches displaying group information, match dates, live states, and team scores. 
- **Federation Outcomes**: Highlights finished matches with confederation win/loss banners (e.g., `🏆 UEFA Win / ❌ CAF Loss` or `🤝 Draw`).
- **Flexible Filters**: Search by team/federation/group names and filter by specific confederations or match states (Finished vs. Scheduled).
- **Dual-Mode Sync Routine**:
  - **Client-Side Live Polling**: Fetches from the live API with an auto-update countdown (every 30s) and manual refresh, showing clear status states.
  - **Local Cache Fallback**: Gracefully shifts to local JSON storage if the live API rate limits are hit or network connections drop.
  - **CLI Synchronization**: A backend utility to pull and write data directly to the local cache.

---

## 🛠️ Tech Stack

- **Core**: React 19, TypeScript, Vite
- **Styling**: Vanilla CSS utilizing CSS Variables, Flexbox, CSS Grid, Glassmorphism, and neon glowing borders (no heavy CSS frameworks)
- **Data Sync**: Node.js ESM script using native `fetch`

---

## 🚀 Getting Started

### 1. Installation
Clone the repository, navigate to the directory, and install the npm dependencies:
```bash
npm install
```

### 2. Pull the Latest Data
Use the custom sync routine script to download the current matches dataset from the World Cup 2026 API and cache it locally:
```bash
npm run sync
```
This saves the file directly into `public/data/games.json`.

### 3. Launch Development Server
Start the local development server:
```bash
npm run dev
```
Open the console-printed URL (usually `http://localhost:5173/` or `http://localhost:5174/`) in your browser to view the application.

### 4. Build for Production
To bundle the application for production deployment:
```bash
npm run build
```

### 5. Firebase Deployment
To test and deploy the application to Firebase Hosting:

* **Emulate/Test Locally**:
  ```bash
  npm run serve:hosting
  ```
  This starts the Firebase emulator locally, serving the production build (`dist` directory) at `http://localhost:5000/`.

* **Deploy Live**:
  ```bash
  npm run deploy
  ```
  This compiles the app (running `npm run build` automatically as a pre-deployment step) and deploys it to the live Firebase CDN.

---

## 📝 Folder Structure

```text
├── public/
│   └── data/
│       └── games.json       # Cached offline fallback data
├── scripts/
│   └── sync-data.js         # ESM CLI sync routine script
├── src/
│   ├── assets/              # Default scaffolded assets
│   ├── data/
│   │   └── federations.ts   # 48 qualified countries & federation mappings
│   ├── App.tsx              # Main dashboard React container & standings logic
│   ├── index.css            # Global CSS design system and glassmorphic styles
│   └── main.tsx             # React DOM entry point
├── index.html               # Custom HTML document with Google Fonts & SEO tags
├── package.json             # NPM dependencies & scripts definition
└── tsconfig.json            # TypeScript configuration
```

---

## 🧮 Calculations Methodology

1. **Intra-Federation Matches**: For matches between teams of the *same* federation (e.g. Germany vs. Switzerland):
   - The match contributes **2 played team-matches** to that federation's record.
   - In case of a decisive outcome, the federation gets **1 Win** and **1 Loss** (adding 3 points to its total).
   - In case of a draw, the federation gets **2 Draws** (adding 2 points to its total).
   This ensures that all matches are represented consistently.
2. **Sorting Rule**: Federations are ranked in the leaderboard using **Average Points per Game** (Points / Games Played) as the primary index, followed by Win Rate (%), Goal Difference, and Goals For.
