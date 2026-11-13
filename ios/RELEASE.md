# TestFlight and App Store release

## First release on a Mac

Use a current Xcode version accepted for App Store submissions. Select your team and registered bundle ID in the app target. Choose an iPhone/iPad device destination, run tests, and use Product → Archive. In Organizer, validate and distribute to App Store Connect. Add internal testers first; external TestFlight testing may require Apple's beta review.

Before public release, supply your app name, support URL, privacy-policy URL, age-rating answers, content-rights declarations, app screenshots, and review information in App Store Connect. Verify ownership or permission to distribute the supplied collection under the app's distribution terms. The implementation does not introduce a new license for source texts or translations.

The icon reuses the website's existing book mark. The app has no accounts, analytics, advertising SDKs, or paid functionality. Bookmarks and recent reading are local. Update checks contact the configured GitHub Pages host; external references use Safari. Publish a privacy policy that describes those facts and your actual operating practices. Check Xcode's generated privacy report before uploading; adjust the manifest if future APIs or SDKs change its requirements.

## Optional GitHub signing and TestFlight upload

Install both supplied workflows at the root of the existing website repository. Create a GitHub environment named `testflight`; restrict it to your release branch and, if desired, add a required reviewer. Configure these repository/environment variables:

| Variable | Value |
| --- | --- |
| `IOS_TEAM_ID` | Your Apple team ID |
| `IOS_BUNDLE_ID` | The app's registered bundle identifier |
| `IOS_PROFILE_NAME` | Exact name of its App Store distribution provisioning profile |

Configure these environment secrets through GitHub's settings; do not paste private keys or passwords into chat or commit them:

| Secret | Value |
| --- | --- |
| `IOS_DISTRIBUTION_P12_BASE64` | Base64 of an exported Apple Distribution certificate and its private key |
| `IOS_DISTRIBUTION_P12_PASSWORD` | Password for that export |
| `IOS_PROFILE_BASE64` | Base64 of the matching App Store provisioning profile |
| `IOS_KEYCHAIN_PASSWORD` | A long random password used only for the temporary CI keychain |
| `ASC_KEY_ID` | App Store Connect API key ID |
| `ASC_ISSUER_ID` | Its issuer ID |
| `ASC_PRIVATE_KEY` | Contents of its `.p8` private-key file |

Use an App Store Connect API role permitted to upload builds. Keep the certificate and provisioning profile renewed. The workflow installs them only on a temporary macOS runner and removes the key/keychain material at the end.

Run **Build offline iOS app** first. It must finish successfully, including the simulator and device compile job. Then manually run **Publish tested iOS build to TestFlight**, entering that build's run ID and a marketing version such as `1.0`. The workflow rejects failed builds, foreign repositories, and non-main branches. It derives the build number from its own monotonically increasing workflow run number and attempt. If you have already uploaded a higher build number manually, adjust the workflow's numbering before the next upload.

The upload workflow does not submit a public App Store release. Wait for Apple's processing, assign TestFlight testers in App Store Connect, and inspect the actual installed build. Native signing and this workflow must be exercised with your Apple account before relying on automated releases.

## App Store screenshots

Run **Capture App Store screenshots** with the run ID of a successful **Build offline iOS app** run. It captures six screens (reader, catalog search, subject graph, volume, study guide and the offline Collection screen) on the newest 6.3-inch iPhone, 6.9-inch iPhone and 13-inch iPad simulators, with a clean 9:41 status bar, and checks that every image has a size App Store Connect accepts. Download the `app-store-screenshots-iphone-6.3`, `app-store-screenshots-iphone-6.9` and `app-store-screenshots-ipad-13` artifacts and upload the PNGs to the matching slots on the version page: 6.3-inch to "iPhone with Dynamic Island (medium display)", 6.9-inch to the large-display slot. The pages are listed in `PartialInventoryUITests/AppStoreScreenshots.swift`; Debug builds open them with the `-PIStartPage` launch argument, which Release builds ignore.

## Required device acceptance

Run these checks on an actual iPhone and iPad, not only a simulator:

- Delete the app, install the candidate, enable Airplane Mode before its first launch, and open it. This proves the collection is bundled instead of relying on a previous cache.
- Search English words, a quoted phrase, a Persian/Arabic word, and an exact filename ID. Open records with both languages, a single language, unequal paragraph counts, long content, and footnotes.
- Browse all three main sections. Follow subject graph connections, open a study guide and the original subject PDF view, and confirm the print view becomes ready.
- Open several PDFs including the first and last listed volume, jump to a late page, change zoom, and follow an internal PDF link. Confirm no PDF-host request is needed.
- Add bookmarks with paragraph anchors and volume/page selections, force-quit, and reopen. Install an updated build and check that bookmarks still resolve.
- Check Copy link and the native share sheet: links must start with the public website address, never `127.0.0.1`.
- Scroll to the foot of Catalog, Volumes, Subjects and a study guide: each reads “Partial Inventory browser” at the left, with no visitor count, and “About this collection” at the right. The website's count is not part of the app.
- Check print/save-to-Files, selection/copy, native find, iPad split view, rotation, keyboard navigation, VoiceOver, text sizes, day/night themes, and back/forward gestures.
- Open an external reference offline and online. Offline failure must not make the local reader unavailable. Open **Collection and updates** offline and confirm the installed reader remains usable.
- Interrupt an App Store/TestFlight update and confirm the previous installed app is still usable; then complete the update and confirm the collection version changes.
- Check Settings storage size and launch/memory behavior on the oldest supported device. This is a substantial collection.

If future website changes add external scripts, remote fonts, APIs, new file types, or root-relative routes outside `/PI_browser/`, adapt the offline packager and MIME/router rules deliberately and rerun these checks. Do not solve offline failures by silently loading the live website.

## Suggested review notes

Partial Inventory is a bilingual reference library. Its entire collection, full-text search indexes, subject graph, study guides, and volume PDFs are included in the installed app. Please test a fresh launch with Airplane Mode enabled. There is no login or subscription. Native controls provide bookmarks, local reading history, canonical-link sharing, find-on-page, and printing. External bibliography/comparative references may lead to independent websites; the bundled collection does not require them. The Collection screen identifies the installed source release and provides an optional online release check.

## Local rebuild from a verified website artifact

From the existing website repository, after a successful build and tests, prepare its publication artifact with a real source commit:

```sh
node scripts/prepare-pages.mjs YOUR_40_CHARACTER_COMMIT
node ios/scripts/package-website.mjs \
  --site public-site \
  --audit publication-audit/YOUR_40_CHARACTER_COMMIT/DATASET_ID \
  --pdf-site pdf-site \
  --bibliography 'docs/Bibliography, Source Codes and Subject Schema.pdf' \
  --output ios/PartialInventory/Website \
  --commit YOUR_40_CHARACTER_COMMIT
python3 ios/scripts/generate-project.py
```

The output directory must be absent. Move an earlier generated Website folder aside before repackaging. Do not delete original corpus folders. `publication.json` identifies the dataset ID; the packager refuses a mismatched audit or changed source file. The first local package supplied with this handoff was built in an isolated workspace from the recorded Git commit, without rebuilding the user's primary checkout.
