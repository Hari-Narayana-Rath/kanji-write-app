# Kanji Write App

Phone-first kanji writing practice app with:

- stroke-order validation
- Anki-style spaced repetition
- separate `N5`, `N4`, and `N3` decks
- local progress storage

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Data Sync

Regenerate the JLPT kanji deck:

```bash
npm run sync:deck
```

## Android

This repo is configured for Capacitor. You do not need another repo.

Prepare the Android project:

```bash
npm run android
```

Open it in Android Studio:

```bash
npm run android:open
```

To build for the Play Store later you still need:

- Java JDK
- Android Studio
- Android SDK
- a Play Console account

## GitHub Pages

This repo is configured for GitHub Pages at:

`https://hari-narayana-rath.github.io/kanji-write-app/`
