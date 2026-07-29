# Counterpick mobile

The Counterpick mobile application helps a Dota 2 player choose a hero under draft-time pressure. A user can import a draft image or enter heroes manually, select the match rank and position, and receive three explainable counterpick recommendations.

Account creation is optional. The app starts in guest mode and supports OTP-gated registration, sign-in, guest upgrade, password reset, and password change. The current pre-launch backend can use a shared static code instead of real email delivery.

## Features

- Camera and gallery draft import with server-side hero recognition.
- Four-step manual draft flow for opponents, optional allies, rank, and position.
- Counterpick results with strengths, risks, role context, and match-rank context.
- Current meta catalog, filters, search, hero profiles, rank win rates, and build timings.
- Local and synchronized analysis history.
- Wishlist with multi-select removal.
- Analysis feedback and a personal reviews list.
- Free and Pro quota states through a RevenueCat adapter.
- Russian and English localization.
- System, light, and dark appearance modes.
- Reduced-motion support, safe-area handling, native Stack navigation, native search, and platform sheets where appropriate.

## Stack

- Expo 57 and Expo Router 57
- React Native 0.86 and React 19.2
- TypeScript 6
- TanStack Query, Zustand, React Hook Form, and Zod
- React Native Reanimated, Gesture Handler, FlashList, Expo Image, Expo Video, and Lottie
- Expo Secure Store and AsyncStorage
- RevenueCat React Native SDK
- Oswald, IBM Plex Sans, and IBM Plex Mono

## Requirements

- Node.js 24 and npm
- Expo Go for JavaScript-only development flows
- A native development build for real RevenueCat purchase testing

The app can launch, create a local guest, and perform its basic manual offline flow without the API. A deployed or local Counterpick API is required for server-backed authentication, current meta data, photo recognition, synchronized history, authoritative quota, reviews, and billing state.

## Environment

Create the local environment file:

```powershell
Copy-Item .env.example .env
```

Available public variables:

```dotenv
EXPO_PUBLIC_API_URL=https://example.com/v1
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=pro
```

For an API running on the same computer:

```dotenv
EXPO_PUBLIC_API_URL=http://localhost:4000/v1
```

Android emulators normally reach the host through `http://10.0.2.2:4000/v1`. A physical device needs a reachable LAN or HTTPS address. Restart Expo after changing public environment variables.

Production EAS profiles require an API URL and both platform RevenueCat public SDK keys. These public keys are safe for the client; database, Gemini, JWT, webhook, and admin secrets are not.

## Development

Install and start:

```powershell
npm ci
npm start
```

Useful commands:

| Command | Purpose |
| --- | --- |
| `npm run start:clear` | Start Expo after clearing the Metro cache |
| `npm run android` | Start Expo and open the Android target |
| `npm run web` | Start the React Native web target |
| `npm run native:android` | Generate and run a native Android development build |
| `npm run native:ios` | Generate and run a native iOS development build; requires macOS locally |
| `npm run doctor` | Check Expo package and configuration compatibility |
| `npm run typecheck` | Run TypeScript without emitting files |
| `npm run lint` | Run Expo ESLint |
| `npm run format` | Format the package with Prettier |
| `npm run format:check` | Check Prettier formatting |

## Application structure

```text
app/                 Expo Router routes and native navigation configuration
languages/           Native app-name localization metadata
src/components/      Shared product and system-aware UI
src/data/            Static Dota and presentation data
src/hooks/           Reusable application and domain hooks
src/i18n/            Runtime localization provider and translations
src/navigation/      Shared navigation primitives
src/providers/       Root application providers
src/services/        API, session, billing, image, network, and offline services
src/store/           Persistent and in-memory application state
src/theme/           Tokens, type, color, and shape definitions
src/types/           Shared TypeScript contracts
src/utils/           Framework-independent helpers
assets/              Brand, role, state, and Lottie assets
```

## Runtime behavior

- System language mode continues to follow the device language until the user overrides it; unsupported languages fall back to English.
- System appearance mode continues to follow the device theme until the user explicitly chooses light or dark.
- Native targets store access and refresh credentials through Secure Store. The web development target uses `localStorage` with an in-memory fallback and should not be treated as equivalent secure storage.
- Guest history remains usable without registration and can be associated with an upgraded account.
- API data is cached through TanStack Query, while durable user preferences use local storage.
- Photo analysis requires the backend and Gemini vision. Manual recommendations retain a deterministic backend fallback when AI reranking is unavailable.

## Billing

Expo Go does not include the native RevenueCat module required for real purchases. Use a development build or a store build to test products, restoration, and entitlement updates. The server remains the authority for quota state and validates RevenueCat webhook events.

## Before submitting a change

```powershell
npm run typecheck
npm run lint
npm run format:check
npm run doctor
```

Verify both themes, both languages, guest and authenticated states, quota exhaustion, offline/error states, keyboard avoidance, and the critical draft-to-result flow on the platforms affected by the change.
