# Google Sheets DB Connection

## Connected spreadsheet

- File name: `recommended cities`
- Spreadsheet ID: `1VyIVKXJijMQRJfnRMWXMvcQ0DmRpDDmGPqVKO5Eo8rA`
- Purpose: Travel destination seed DB for the MVP.

The spreadsheet is used as the main seed database for the MVP destination recommendation engine.

## Tabs used by the MVP loader

The loader reads these tabs:

| Sheet tab | Required | Used for |
|---|---:|---|
| `Cities_Base` | Yes | city id, city name, country, region, main airport, timezone, data quality |
| `City_Airports` | Yes | primary/alternate airport rows by `city_id` |
| `City_Monthly_Climate` | Yes | monthly average temperature and rainfall |
| `City_Intros` | Yes | short intro, keywords, recommended nights |
| `City_Seasons` | Yes | best months and weather caution months |
| `City_Landmarks` | Yes | landmark list |
| `Cost_Profiles` | Optional but recommended | flight, hotel, daily local cost ranges |
| `Style_Scores` | Optional but recommended | 1-5 style fit scores |
| `Companion_Scores` | Optional but recommended | 1-5 companion fit scores |

All tabs are joined by `city_id`.

The three MVP scoring tabs are now connected in `src/google-sheets.ts`:

- `Cost_Profiles` → `Destination.costProfile`
- `Style_Scores` → `Destination.styleScores`
- `Companion_Scores` → `Destination.companionScores`

If one of the optional tabs is missing or a row is not filled for a city, the loader falls back to derived/default values so the app can still run.

## Code entry points

```ts
import { loadDestinationsFromGoogleSheets } from "./google-sheets";

const destinations = await loadDestinationsFromGoogleSheets();
```

Example runner:

```bash
npm run sheet:example
```

## Access modes

The loader supports two access modes.

### 1. Public CSV mode

This is the simplest mode. It uses Google Sheets CSV export.

Use this when the spreadsheet is set to:

```text
Share > General access > Anyone with the link > Viewer
```

Run with:

```bash
GOOGLE_SHEETS_ACCESS_MODE=public npm run sheet:example
```

### 2. Service account mode

Use this when the sheet should stay private.

Required steps:

1. Create a Google Cloud service account.
2. Enable Google Sheets API for the Google Cloud project.
3. Create a service account key.
4. Copy the service account email.
5. Open the spreadsheet and share it with that service account email as Viewer.
6. Set these environment variables in Codespaces.

```bash
export GOOGLE_SHEETS_ACCESS_MODE="service_account"
export GOOGLE_SERVICE_ACCOUNT_EMAIL="your-service-account-email"
export GOOGLE_PRIVATE_KEY="your-private-key-with-newlines-written-as-backslash-n"
npm run sheet:example
```

The private key must keep line breaks. In an environment variable, write line breaks as `\n`. The loader converts `\n` back into real newlines before signing the JWT.

`auto` mode uses service account mode if the service account environment variables exist. Otherwise, it tries public CSV mode.

```bash
GOOGLE_SHEETS_ACCESS_MODE=auto npm run sheet:example
```

## Why 401 happens

A 401 from `docs.google.com/spreadsheets/.../gviz/tq` means the script tried to fetch the sheet anonymously but Google did not allow it.

Fix it with one of these:

- Make the spreadsheet viewable by anyone with the link.
- Or use service account mode and share the spreadsheet with the service account email.

## `Cost_Profiles` expected columns

Minimum recommended structure:

| column | example | note |
|---|---|---|
| `city_id` | `fukuoka_japan` | join key |
| `flight_cost_min_krw` | `180000` | rough MVP range |
| `flight_cost_max_krw` | `420000` | rough MVP range |
| `hotel_per_night_min_krw` | `70000` | per-night hotel range |
| `hotel_per_night_max_krw` | `150000` | per-night hotel range |
| `daily_local_cost_min_krw` | `70000` | food, transport, basic activities |
| `daily_local_cost_max_krw` | `140000` | food, transport, basic activities |
| `budget_note` | `Prices vary in peak season.` | optional note |
| `data_status` | `seed_draft` | optional source/status |
| `needs_review` | `TRUE` | production check flag |
| `last_updated` | `2026-06-25` | optional |

The loader also supports common aliases such as:

- `flight_cost_avg_krw`, `icn_flight_avg_krw`
- `hotel_avg_krw`, `accommodation_avg_krw`
- `daily_cost_avg_krw`, `daily_stay_avg_krw`
- `local_transport_min_krw`, `local_transport_max_krw`

If both daily stay cost and local transport cost are present, the loader combines them into `dailyLocalCostRange`.

## `Style_Scores` expected columns

| column | score range |
|---|---|
| `city_id` | text |
| `budget` | 1-5 |
| `food` | 1-5 |
| `shopping` | 1-5 |
| `nature` | 1-5 |
| `culture` | 1-5 |
| `activity` | 1-5 |
| `relaxed` | 1-5 |
| `photo` | 1-5 |
| `local_experience` | 1-5 |

Optional extra columns like `family_friendly` or `first_timer` can stay in the sheet, but the current MVP scoring engine does not use them yet.

## `Companion_Scores` expected columns

| column | score range |
|---|---|
| `city_id` | text |
| `solo` | 1-5 |
| `couple` | 1-5 |
| `friends` | 1-5 |
| `family` | 1-5 |
| `parents` | 1-5 |

Optional extra columns like `children` can stay in the sheet, but the current MVP scoring engine does not use them yet.
