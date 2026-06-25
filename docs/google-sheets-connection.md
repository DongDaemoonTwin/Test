# Google Sheets DB Connection

## Connected spreadsheet

- File name: `recommended cities`
- Spreadsheet ID: `1VyIVKXJijMQRJfnRMWXMvcQ0DmRpDDmGPqVKO5Eo8rA`
- Purpose: Travel destination seed DB for the MVP.

The current spreadsheet is a seed database. It contains 445 cities, 112 countries, airport rows, intro rows, season rows, landmark rows, and monthly climate rows.

## Tabs used by the MVP loader

The first loader reads these tabs:

| Sheet tab | Used for |
|---|---|
| `Cities_Base` | city id, city name, country, region, main airport, timezone, data quality |
| `City_Airports` | primary/alternate airport rows by `city_id` |
| `City_Monthly_Climate` | monthly average temperature and rainfall |
| `City_Intros` | short intro, keywords, recommended nights |
| `City_Seasons` | best months and weather caution months |
| `City_Landmarks` | landmark list |

These tabs are joined by `city_id`.

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

## Current limitations

The existing Google Sheet does not yet have MVP-ready cost columns for:

- flight cost range from ICN / GMP / NRT / KIX
- hotel cost range per night
- daily local cost range
- direct flight flag
- estimated flight time from departure airport

Because of that, the current scoring engine treats cost feasibility as neutral when live cost data is missing.

## Recommended next sheet tabs

Add these MVP-specific tabs after the current DB structure is stable:

### `Cost_Profiles`

| column | example | note |
|---|---|---|
| `city_id` | `fukuoka_japan` | join key |
| `departure_airport` | `ICN` | ICN, GMP, NRT, KIX etc. |
| `flight_cost_min_krw` | `180000` | rough MVP range |
| `flight_cost_max_krw` | `420000` | rough MVP range |
| `hotel_per_night_min_krw` | `70000` | per room or per person must be defined |
| `hotel_per_night_max_krw` | `150000` | rough MVP range |
| `daily_local_cost_min_krw` | `70000` | food, local transport, basic activities |
| `daily_local_cost_max_krw` | `140000` | food, local transport, basic activities |
| `flight_time_hours` | `1.4` | one-way average |
| `direct_flight_available` | `TRUE` | MVP feasibility filter |
| `data_status` | `seed_draft` | data quality |
| `needs_review` | `TRUE` | production check flag |

### `Style_Scores`

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

### `Companion_Scores`

| column | score range |
|---|---|
| `city_id` | text |
| `solo` | 1-5 |
| `couple` | 1-5 |
| `friends` | 1-5 |
| `family` | 1-5 |
| `parents` | 1-5 |
