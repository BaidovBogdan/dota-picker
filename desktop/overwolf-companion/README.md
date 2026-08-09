# Counterpick Live for Overwolf

Overwolf companion that reads exact Dota 2 draft events through the official Game Events Provider and sends a sanitized snapshot to Counterpick over an authenticated WebSocket bound to `127.0.0.1`.

The manifest starts a hidden `is_background_page` controller. Only that controller registers GEP features and owns the WebSocket/heartbeat lifecycle. A separate desktop status window reads sanitized state through Overwolf's recommended `getMainWindow()` controller bridge, so closing or minimizing the status UI does not throttle live data.

## Local QA

Requirements: Node.js 22+, npm, the Overwolf desktop client, and an Overwolf account that has been whitelisted for development after an app proposal was approved.

This whitelist is a hard Overwolf platform requirement. Installing or opening the public Overwolf Appstore client is not enough to run an unpacked or otherwise unreleased companion. Local QA does not require publishing Counterpick Live in the Appstore, but it does require Overwolf to approve the proposal and whitelist the account used in the client. Overwolf's current onboarding policy says private apps that are not planned for the Appstore are not approved, so there is no supported no-submission shortcut. An `Unauthorized App` message means the account is not logged in or is not whitelisted.

### Build and load the unpacked companion

```powershell
npm ci
npm run verify
```

The generated `dist/` folder is intentionally ignored by the repository-wide `.gitignore`. Its root contains `manifest.json`; this folder, rather than the source directory, is the unpacked extension.

1. Sign in to the Overwolf client with the whitelisted account.
2. Open **Settings → About → Development options → Load unpacked extension**.
3. Select `desktop/overwolf-companion/dist`.
4. Confirm that **Counterpick Live** appears in Development options or the Overwolf dock, then launch it once. Its status window should say **Waiting for Counterpick**.
5. Start the Counterpick desktop app and enable the draft assistant.
6. Select **Overwolf Live**. On first use, accept the disclosure with **Allow and enable**; this also starts pairing. If consent was already saved, press **Connect** in the Overwolf Live card.

The custom `counterpick-overwolf-live` URL wakes the loaded companion and passes a short-lived loopback port and session token. Pairing should change from **Pairing** to **Connected** within 15 seconds. The visible status window can be closed independently; the hidden controller remains active and owns GEP registration, the authenticated WebSocket, heartbeat, and automatic reconnection.

### Run a live Dota 2 draft

Dota 2 must be launched with `-gamestateintegration`. Add it explicitly in Steam under **Dota 2 → Properties → General → Launch Options**, then restart the game. The companion detects this flag but does not silently modify Steam settings.

During a real hero-selection phase, the expected progression is:

1. Counterpick Live shows **Connected**.
2. **Game** changes to **Detected** after Dota 2 starts.
3. **Draft** changes to **Hero selection**.
4. **Picks** increases from `0 / 10` as Overwolf supplies `roster` and `draft` updates.
5. Counterpick changes from waiting to calculating and fills its ally/enemy slots. Team and local position come from the official `me` and `roster` payloads; no fixed Radiant or Dire setting is required.

The Dota 2 GEP page notes that some roster identity fields remain empty until strategy time. Counterpick Live intentionally does not forward Steam IDs or player names and uses hero/team/slot/role data only.

### Diagnostics

- Counterpick bridge and analysis log: `%APPDATA%\@counterpick\desktop\logs\main.log`.
- Successful pairing markers: `Authenticated Overwolf companion connected`, `BRIDGE_CONNECTED`, and then `GEP_FEATURES_READY` after Dota event features register.
- `Overwolf companion pairing timed out` means the desktop bridge opened but no loaded companion completed the handshake. Installing only the base Overwolf platform produces this state.
- Companion console: **Overwolf Settings → About → Development options → Counterpick Live → background**. Use the `background` controller for pairing and GEP diagnostics; `status` is only the visible status window. With developer tools enabled, the visible window can also be inspected with `Ctrl+Shift+I`.
- Overwolf client trace logs: `%LOCALAPPDATA%\Overwolf\Log`. Inspect the newest `Trace_*.log` for extension loading, overlay, and game-detection errors.

Useful official QA references:

- [App proposal and current whitelist policy](https://dev.overwolf.com/ow-native/getting-started/project-roadmap/)
- [Development environment and whitelist requirement](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/setting-up-dev-environment/)
- [Load an unpacked extension](https://dev.overwolf.com/ow-native/getting-started/onboarding-resources/basic-sample-app/)
- [Enable and access Overwolf developer tools](https://dev.overwolf.com/ow-native/guides/dev-tools/use-enable-developer-tools/)
- [Dota 2 GEP events and launch option](https://dev.overwolf.com/ow-native/live-game-data-gep/supported-games/dota-2/)
- [Overwolf trace log location](https://dev.overwolf.com/ow-native/guides/test-your-app/ow-logs/trace/)
- [Release and OPK requirements](https://dev.overwolf.com/ow-native/getting-started/release-your-app/)
- [Overwolf installer and Developer Console requirements](https://dev.overwolf.com/ow-electron/guides/dev-tools/overwolf-installer/)

## Production release

A production build requires an approved Overwolf app proposal, Developer Console app identity, QA approval, store assets, and a signed OPK. After the public Appstore listing exists, set its HTTPS URL in the Electron app:

```dotenv
MAIN_VITE_OVERWOLF_STORE_URL=https://www.overwolf.com/app/...
```

Until this value is configured, Counterpick keeps the in-app companion install action unavailable and explains why. The Counterpick Windows NSIS installer may separately offer the base Overwolf platform when it is absent, but only through an unchecked opt-in, an official HTTPS download, a valid Overwolf Authenticode signature, and the interactive Overwolf installer. This generic platform flow does not install the unpublished Counterpick Live companion and does not enable Live mode. A production companion installation still requires an approved Appstore listing or installer that shows Overwolf's terms, privacy, and consent flow. Hidden or silent third-party installation is intentionally unsupported.

The pairing URL protocol is fixed to `counterpick-overwolf-live` in both packages so a build-time override cannot create an incompatible desktop/companion pair.
