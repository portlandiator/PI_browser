# Offline iOS reader

This directory contains the iPhone/iPad app for the Partial Inventory website. Open `PartialInventory.xcodeproj` in Xcode after generating the `PartialInventory/Website/` resource folder. The app targets iOS/iPadOS 17 or later and has no third-party native dependencies.

The native app adds bookmarks, recent reading, link sharing, find-on-page, printing, and release information. It serves a complete, read-only website snapshot over device loopback so the original search workers, bilingual reader, graph, study guides, and PDF.js viewer remain usable offline.

The generated Website folder is ignored by Git. It includes the entire public collection and all volume PDFs, plus the bibliography. Its `offline-version.json` records the source commit, dataset, counts, size, and public PDF address. `offline-files.json` records the packaged checksums. Only PDF-hosting configuration and the bibliography link are localized; source wording and metadata remain intact. The website's weekly visitor count is left out: the packager writes `visitor-count.mjs` as an empty module and omits the graph of the weekly counts (`visitors.html`, `visitor-graph.mjs`, `visitors.css`), so the app counts nothing and its footers keep their own wording.

From the repository root, run the normal full website build and tests in the appropriate isolated build/release checkout, then use `scripts/prepare-pages.mjs` and `ios/scripts/package-website.mjs` as described in [RELEASE.md](RELEASE.md). Do not use a stale primary `dist` directory as an unverified substitute.

The workflow `.github/workflows/ios.yml` follows successful website deployments, packages the exact source revision, runs the offline browser checks, and tests the native app on a macOS runner. `.github/workflows/ios-testflight.yml` uploads a chosen successful build only when manually dispatched with the configured signing credentials. See [RELEASE.md](RELEASE.md) for setup and acceptance checks.

Website changes arrive on installed devices through TestFlight/App Store app updates. Bookmarks and history remain in Application Support and survive installation of a new app bundle. Checking the website release in the app does not download or execute replacement app code.

Tests:

```sh
node --test ios/tests/*.test.mjs
xcodebuild -project ios/PartialInventory.xcodeproj -scheme PartialInventory \
  -destination 'platform=iOS Simulator,name=YOUR_SIMULATOR' test
```

On Windows, add `--test-isolation=none` if the sandbox prevents Node from spawning test processes. Xcode compilation, native UI tests, signing, and App Store upload require macOS. The optional web-bundle test uses the development dependency in `ios/package.json`; it is not an iOS simulator and does not replace device testing.
