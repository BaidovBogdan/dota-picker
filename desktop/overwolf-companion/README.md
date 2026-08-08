# Counterpick Live for Overwolf

Overwolf companion that reads exact Dota 2 draft events through the official Game Events Provider and sends a sanitized snapshot to Counterpick over an authenticated WebSocket bound to `127.0.0.1`.

The manifest starts a hidden `is_background_page` controller. Only that controller registers GEP features and owns the WebSocket/heartbeat lifecycle. A separate desktop status window reads sanitized state through Overwolf's recommended `getMainWindow()` controller bridge, so closing or minimizing the status UI does not throttle live data.

## Local QA

Requirements: Node.js 22+, npm, an Overwolf developer-whitelisted account, and the Overwolf desktop client.

```powershell
npm run verify
```

The generated `dist/` folder is intentionally ignored by the repository-wide `.gitignore`. In Overwolf open **Settings → About → Development options → Load unpacked extension** and select this `dist/` folder. Start Counterpick, choose **Overwolf Live**, accept the disclosure, and press **Connect**. The visible status window can be closed independently; the hidden controller remains active until the app is stopped or Overwolf Live is disabled in Counterpick.

Dota 2 must be launched with `-gamestateintegration`. Add it explicitly in Steam under **Dota 2 → Properties → General → Launch Options**, then restart the game. The companion detects this flag but does not silently modify Steam settings.

Useful official QA references:

- [Load an unpacked extension](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/basic-sample-app/)
- [Dota 2 GEP events and launch option](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/dota-2/)
- [Release and OPK requirements](https://dev.overwolf.com/ow-native/getting-started/release-your-app/)
- [Overwolf installer and Developer Console requirements](https://dev.overwolf.com/ow-electron/guides/dev-tools/overwolf-installer/)

## Production release

A production build requires an approved Overwolf app proposal, Developer Console app identity, QA approval, store assets, and a signed OPK. After the public Appstore listing exists, set its HTTPS URL in the Electron app:

```dotenv
MAIN_VITE_OVERWOLF_STORE_URL=https://www.overwolf.com/app/...
```

Until this value is configured, Counterpick keeps the in-app companion install action unavailable and explains why. The Counterpick Windows NSIS installer may separately offer the base Overwolf platform when it is absent, but only through an unchecked opt-in, an official HTTPS download, a valid Overwolf Authenticode signature, and the interactive Overwolf installer. This generic platform flow does not install the unpublished Counterpick Live companion and does not enable Live mode. A production companion installation still requires an approved Appstore listing or installer that shows Overwolf's terms, privacy, and consent flow. Hidden or silent third-party installation is intentionally unsupported.

The pairing URL protocol is fixed to `counterpick-overwolf-live` in both packages so a build-time override cannot create an incompatible desktop/companion pair.
