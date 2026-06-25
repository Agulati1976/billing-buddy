## Why this is a local edit

The `android/` folder is generated on your Windows machine by `npx cap add android` — it isn't part of the Lovable project, so I can't modify it from here. You'll edit one file locally.

## File to edit

`C:\Users\welcome\Downloads\newapp\billing-buddy\android\app\src\main\AndroidManifest.xml`

## Changes

Inside the root `<manifest>` element (NOT inside `<application>`), add these lines — place them just above the `<application ...>` tag:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />

<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
```

Notes:
- `CAMERA` is the one required for barcode scanning.
- `RECORD_AUDIO` / `MODIFY_AUDIO_SETTINGS` are only needed if you also use mic (safe to include; harmless otherwise — remove if you want a minimal manifest).
- `android:required="false"` on the features means the app still installs on devices without a camera (recommended for Play Store reach).

## Example — full top of file should look like

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <application
        android:allowBackup="true"
        ...
    >
        ...
    </application>
</manifest>
```

Keep any existing `<uses-permission>` lines that are already there (e.g. `INTERNET`).

## Rebuild

From `C:\Users\welcome\Downloads\newapp\billing-buddy\android` in PowerShell:

```
./gradlew clean
./gradlew bundleRelease
```

Output `.aab`: `android/app/build/outputs/bundle/release/app-release.aab`

## After install

The first time the user taps "Scan barcode" / "Enable camera", Android will show a system permission prompt. If they tap "Don't allow", they'll need to enable it manually in Settings → Apps → Bill Look → Permissions → Camera.
