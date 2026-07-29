# Dota GSI probe

This is a local research receiver for Valve's standard Dota 2 Game State Integration payloads. It records the fields that the game actually exposes during different states so the desktop product can be designed from evidence instead of assumptions.

The probe uses only Node.js built-ins, binds to the loopback interface by default, redacts its authentication token before writing payloads, and does not send data to the Counterpick API.

## Requirements

- Node.js 24
- Dota 2 installed through Steam
- Permission to add a local Game State Integration configuration

There are no package dependencies to install.

## Configure Dota 2

Copy:

```text
config/gamestate_integration_counterpick.cfg
```

to:

```text
<Steam library>/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/gamestate_integration_counterpick.cfg
```

Create the `gamestate_integration` directory if it does not exist. Add this Dota 2 launch option in Steam:

```text
-gamestateintegration
```

The checked-in configuration posts to `http://127.0.0.1:32123/gsi` with the local token `counterpick-local-probe`.

## Capture a session

Start the receiver before launching or entering the relevant Dota state:

```powershell
npm start
```

The service exposes status at:

```text
http://127.0.0.1:32123/health
```

Stop it with `Ctrl+C` after the observed flow is complete.

## Inspect captured data

Show the latest useful snapshot:

```powershell
npm run inspect
```

Analyze state transitions and observed draft signals across recorded sessions:

```powershell
npm run analyze
```

Generated files are stored in the ignored `output` directory:

| File | Content |
| --- | --- |
| `latest.json` | Latest unique sanitized payload |
| `status.json` | Receiver counters and last observation |
| `discovered-paths.json` | Every JSON field path observed so far |
| `gsi-<session>.ndjson` | Unique sanitized payloads preserving the original GSI structure |
| `observations-<session>.ndjson` | Compact state, hero, draft, and player summaries |

Identical consecutive payloads increment a duplicate counter but are not written again. Request bodies are limited to 1 MiB.

## Configuration

The receiver accepts optional environment overrides:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DOTA_GSI_HOST` | `127.0.0.1` | Listening interface |
| `DOTA_GSI_PORT` | `32123` | Listening port |
| `DOTA_GSI_TOKEN` | `counterpick-local-probe` | Expected token from the Dota configuration |

If the host, port, or token changes, update the receiver environment and the matching URI or token in the `.cfg` file.

## Privacy and limitations

- Keep the host on `127.0.0.1` unless remote access is deliberately secured.
- The auth token is redacted, but payloads may still contain match, player, hero, item, or league data.
- Review captured files before sharing them.
- Standard GSI does not guarantee a complete ranked-draft roster, roles, ranks, or bans at every stage.
- This probe does not read game memory, inject code, hook graphics APIs, or provide an in-game overlay.
- It is a research tool, not production desktop telemetry.
