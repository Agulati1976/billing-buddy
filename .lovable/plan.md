## Goal
Use the existing Bill Look logo (`public/billlook-logo.png`) to produce a clean browser favicon and a complete set of native Android/iOS app icons for the Capacitor build.

## What I'll do

### 1. Build a square "icon master" from the logo
- Take `public/billlook-logo.png` and center it on a solid brand-blue (`#1d4fb8`) 1024×1024 square with safe padding (~12%) so it doesn't get clipped by iOS rounded corners or Android adaptive masks.
- Save as `public/billlook-app-icon-1024.png` — this is the single source of truth for all icon sizes.

### 2. Browser tab favicon
- Regenerate from the new master:
  - `public/billlook-favicon.ico` (multi-size: 16/32/48)
  - `public/billlook-favicon.png` (32×32)
  - `public/billlook-icon-192.png`, `public/billlook-icon-512.png` (already linked in `index.html` — just refreshed contents)
- No `index.html` changes needed; existing `<link rel="icon">` tags already point to these filenames.

### 3. Native Android/iOS app icons (Capacitor)
- Install `@capacitor/assets` as a dev dependency.
- Create `resources/icon.png` (the 1024×1024 master) and `resources/icon-foreground.png` + `resources/icon-background.png` for Android adaptive icons (foreground = logo, background = `#1d4fb8`).
- The user will run `npx capacitor-assets generate` locally after pulling the project — this auto-creates every required size for:
  - `android/app/src/main/res/mipmap-*` (legacy + adaptive)
  - `ios/App/App/Assets.xcassets/AppIcon.appiconset`
- Splash screen colors in `capacitor.config.ts` already match (`#1d4fb8`), so no config changes.

### 4. Instructions I'll give the user at the end
A short "run these 3 commands after git pull" block:
```
npm install
npx capacitor-assets generate --assetPath resources
npx cap sync
```

## Technical details
- Image processing in the sandbox uses Python/PIL (already used previously for the icon files).
- Files touched:
  - **New**: `public/billlook-app-icon-1024.png`, `resources/icon.png`, `resources/icon-foreground.png`, `resources/icon-background.png`
  - **Regenerated**: `public/billlook-favicon.ico`, `public/billlook-favicon.png`, `public/billlook-icon-192.png`, `public/billlook-icon-512.png`, `public/billlook-maskable-512.png`
  - **Edited**: `package.json` (add `@capacitor/assets` devDependency)
- No changes to `index.html`, `vite.config.ts`, or `capacitor.config.ts`.

## Out of scope
- PWA "Add to Home Screen" icon (you didn't pick it — existing manifest icons stay as-is but will look correct since they share the same files).
- Publishing to Play Store / App Store (separate flow).
