import type {
  BudgetCurrency,
  CompanionScores,
  CostProfile,
  CostRange,
  Destination,
  FlightTimeProfile,
  MonthlyClimate,
  StyleScores,
} from "./types";

export const DEFAULT_GOOGLE_SHEET_ID = "1VyIVKXJijMQRJfnRMWXMvcQ0DmRpDDmGPqVKO5Eo8rA";

export const GOOGLE_SHEET_TABS = {
  citiesBase: "Cities_Base",
  airports: "City_Airports",
  climate: "City_Monthly_Climate",
  intros: "City_Intros",
  seasons: "City_Seasons",
  landmarks: "City_Landmarks",
  costProfiles: "Cost_Profiles",
  styleScores: "Style_Scores",
  companionScores: "Companion_Scores",
} as const;

type SheetRecord = Record<string, string>;
type GoogleSheetAccessMode = "auto" | "public" | "service_account";

type LoadGoogleSheetOptions = {
  sheetId?: string;
  accessMode?: GoogleSheetAccessMode;
};

type ServiceAccountToken = {
  accessToken: string;
  expiresAtMs: number;
};

type RuntimeProcess = {
  env?: Record<string, string | undefined>;
};

let cachedServiceAccountToken: ServiceAccountToken | null = null;

const GOOGLE_SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const originCodes = ["ICN", "GMP", "NRT", "KIX"];

const env = (key: string): string => {
  const runtimeProcess = (globalThis as typeof globalThis & { process?: RuntimeProcess }).process;
  return runtimeProcess?.env?.[key]?.trim() ?? "";
};

const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const numberText = (value: unknown): string =>
  text(value)
    .replace(/,/g, "")
    .replace(/원/g, "")
    .replace(/krw/gi, "")
    .trim();

const numberValue = (value: unknown, fallback: number | null = null): number | null => {
  const parsed = Number(numberText(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanValue = (value: unknown): boolean => {
  const normalized = text(value).toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
};

const parseList = (value: unknown, separator: RegExp | string = /[|,]/): string[] =>
  text(value)
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);

const parseMonthList = (value: unknown): number[] =>
  parseList(value)
    .map(Number)
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);

const pickText = (row: SheetRecord | undefined, keys: string[]): string => {
  if (!row) return "";
  for (const key of keys) {
    const value = text(row[key]);
    if (value) return value;
  }
  return "";
};

const pickTextFromRows = (rows: Array<SheetRecord | undefined>, keys: string[]): string => {
  for (const row of rows) {
    const value = pickText(row, keys);
    if (value) return value;
  }
  return "";
};

const pickNumber = (row: SheetRecord | undefined, keys: string[]): number | null => {
  const value = pickText(row, keys);
  return value ? numberValue(value) : null;
};

const pickNumberFromRows = (rows: Array<SheetRecord | undefined>, keys: string[]): number | null => {
  for (const row of rows) {
    const value = pickNumber(row, keys);
    if (value !== null) return value;
  }
  return null;
};

const pickRange = (
  row: SheetRecord | undefined,
  minKeys: string[],
  maxKeys: string[],
  avgKeys: string[] = [],
): CostRange | undefined => {
  const min = pickNumber(row, minKeys);
  const max = pickNumber(row, maxKeys);
  if (min !== null && max !== null) return [min, max];

  const average = pickNumber(row, avgKeys);
  if (average !== null) return [average, average];

  return undefined;
};

const csvExportUrl = (sheetId: string, sheetName: string): string => {
  const params = new URLSearchParams({ tqx: "out:csv", sheet: sheetName });
  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
};

const sheetsApiValuesUrl = (sheetId: string, sheetName: string): string => {
  const range = `'${sheetName.replace(/'/g, "''")}'!A:ZZZ`;
  const params = new URLSearchParams({ majorDimension: "ROWS", valueRenderOption: "FORMATTED_VALUE" });
  return `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?${params.toString()}`;
};

const parseCsv = (csvText: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const rowsToRecords = (rows: string[][]): SheetRecord[] => {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) return [];

  const headers = headerRow.map((header) => header.trim());
  return dataRows
    .map((dataRow) => {
      const record: SheetRecord = {};
      headers.forEach((header, index) => {
        if (header) record[header] = dataRow[index]?.trim() ?? "";
      });
      return record;
    })
    .filter((record) => Object.values(record).some(Boolean));
};

const base64UrlEncode = (input: string | Buffer): string => Buffer.from(input).toString("base64url");

const serviceAccountEmail = (): string =>
  env("GOOGLE_SERVICE_ACCOUNT_EMAIL") || env("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL");

const serviceAccountPrivateKey = (): string =>
  (env("GOOGLE_PRIVATE_KEY") || env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || env("GOOGLE_SHEETS_PRIVATE_KEY")).replace(
    /\\n/g,
    "\n",
  );

const hasServiceAccountCredentials = (): boolean => Boolean(serviceAccountEmail() && serviceAccountPrivateKey());

const createServiceAccountJwt = async (): Promise<string> => {
  const email = serviceAccountEmail();
  const privateKey = serviceAccountPrivateKey();
  if (!email || !privateKey) {
    throw new Error("Google Sheets service account credentials are missing.");
  }

  const { createSign } = await import("node:crypto");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: email,
    scope: GOOGLE_SHEETS_READONLY_SCOPE,
    aud: GOOGLE_OAUTH_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;
  const signature = createSign("RSA-SHA256").update(unsignedJwt).end().sign(privateKey);
  return `${unsignedJwt}.${base64UrlEncode(signature)}`;
};

const getServiceAccountAccessToken = async (): Promise<string> => {
  if (cachedServiceAccountToken && cachedServiceAccountToken.expiresAtMs > Date.now() + 60_000) {
    return cachedServiceAccountToken.accessToken;
  }

  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await createServiceAccountJwt(),
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number; error?: string; error_description?: string }
    | null;

  if (!response.ok || !payload?.access_token) {
    throw new Error(
      [
        "Failed to authenticate Google Sheets service account.",
        `HTTP status: ${response.status}`,
        payload?.error ? `Error: ${payload.error}` : "",
        payload?.error_description ? `Description: ${payload.error_description}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  cachedServiceAccountToken = {
    accessToken: payload.access_token,
    expiresAtMs: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };

  return cachedServiceAccountToken.accessToken;
};

const fetchGoogleSheetTabPublic = async (sheetId: string, sheetName: string): Promise<SheetRecord[]> => {
  const response = await fetch(csvExportUrl(sheetId, sheetName));
  if (!response.ok) throw new Error(`Failed to fetch public Google Sheet tab ${sheetName}: ${response.status}`);

  const csvText = await response.text();
  if (csvText.trim().startsWith("<")) {
    throw new Error(`Google Sheet tab ${sheetName} did not return CSV. Check sharing permissions or sheet name.`);
  }

  return rowsToRecords(parseCsv(csvText));
};

const fetchGoogleSheetTabWithServiceAccount = async (sheetId: string, sheetName: string): Promise<SheetRecord[]> => {
  const accessToken = await getServiceAccountAccessToken();
  const response = await fetch(sheetsApiValuesUrl(sheetId, sheetName), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json().catch(() => null)) as
    | { values?: string[][]; error?: { message?: string; status?: string } }
    | null;

  if (!response.ok || !payload?.values) {
    throw new Error(
      [
        `Failed to fetch Google Sheet tab ${sheetName} through Sheets API.`,
        `HTTP status: ${response.status}`,
        payload?.error?.status ? `Status: ${payload.error.status}` : "",
        payload?.error?.message ? `Message: ${payload.error.message}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return rowsToRecords(payload.values);
};

export const fetchGoogleSheetTab = async (
  sheetName: string,
  options: LoadGoogleSheetOptions = {},
): Promise<SheetRecord[]> => {
  const sheetId = options.sheetId ?? DEFAULT_GOOGLE_SHEET_ID;
  const accessMode = options.accessMode ?? env("GOOGLE_SHEETS_ACCESS_MODE") ?? "auto";

  if (accessMode === "service_account" || (accessMode === "auto" && hasServiceAccountCredentials())) {
    return fetchGoogleSheetTabWithServiceAccount(sheetId, sheetName);
  }

  return fetchGoogleSheetTabPublic(sheetId, sheetName);
};

const fetchOptionalGoogleSheetTab = async (
  sheetName: string,
  options: LoadGoogleSheetOptions = {},
): Promise<SheetRecord[]> => {
  try {
    return await fetchGoogleSheetTab(sheetName, options);
  } catch (error) {
    console.warn(`Optional Google Sheet tab ${sheetName} could not be loaded. Using fallback values.`, error);
    return [];
  }
};

const indexByCityId = (rows: SheetRecord[]): Map<string, SheetRecord> => {
  const map = new Map<string, SheetRecord>();
  for (const row of rows) {
    const cityId = text(row.city_id);
    if (cityId) map.set(cityId, row);
  }
  return map;
};

const groupByCityId = (rows: SheetRecord[]): Map<string, SheetRecord[]> => {
  const map = new Map<string, SheetRecord[]>();
  for (const row of rows) {
    const cityId = text(row.city_id);
    if (!cityId) continue;
    const currentRows = map.get(cityId) ?? [];
    currentRows.push(row);
    map.set(cityId, currentRows);
  }
  return map;
};

const clampScore = (score: number): number => Math.max(1, Math.min(5, score));
const scoreFromRow = (row: SheetRecord | undefined, keys: string[], fallback: number): number =>
  clampScore(pickNumber(row, keys) ?? fallback);

const includesAny = (haystack: string, needles: string[]): boolean => {
  const normalizedHaystack = haystack.toLowerCase();
  return needles.some((needle) => normalizedHaystack.includes(needle.toLowerCase()));
};

const baseStyleScores = (): StyleScores => ({
  budget: 3,
  food: 3,
  shopping: 3,
  nature: 3,
  culture: 3,
  activity: 3,
  relaxed: 3,
  photo: 3,
  localExperience: 3,
});

const deriveStyleScores = (...texts: string[]): StyleScores => {
  const combinedText = texts.join(" ");
  const scores = baseStyleScores();
  if (includesAny(combinedText, ["가성비", "저렴", "budget", "cheap", "backpacker"])) scores.budget = 4;
  if (includesAny(combinedText, ["맛집", "음식", "미식", "food", "cuisine", "restaurant"])) scores.food = 4;
  if (includesAny(combinedText, ["쇼핑", "market", "mall", "shopping", "outlet"])) scores.shopping = 4;
  if (includesAny(combinedText, ["자연", "해변", "산", "섬", "사파리", "national park", "beach", "nature", "island", "mountain"])) scores.nature = 4;
  if (includesAny(combinedText, ["문화", "역사", "박물관", "사원", "성당", "유적", "culture", "history", "museum", "temple", "cathedral"])) scores.culture = 4;
  if (includesAny(combinedText, ["액티비티", "트레킹", "다이빙", "스키", "hiking", "trekking", "diving", "ski", "activity"])) scores.activity = 4;
  if (includesAny(combinedText, ["휴양", "리조트", "온천", "relax", "resort", "spa", "hot spring"])) scores.relaxed = 4;
  if (includesAny(combinedText, ["사진", "야경", "전망", "sns", "photo", "view", "viewpoint", "night view"])) scores.photo = 4;
  if (includesAny(combinedText, ["로컬", "현지", "마을", "시장", "local", "village", "old town"])) scores.localExperience = 4;
  return scores;
};

const buildStyleScores = (styleRow: SheetRecord | undefined, fallback: StyleScores): StyleScores => ({
  budget: scoreFromRow(styleRow, ["budget"], fallback.budget),
  food: scoreFromRow(styleRow, ["food"], fallback.food),
  shopping: scoreFromRow(styleRow, ["shopping"], fallback.shopping),
  nature: scoreFromRow(styleRow, ["nature"], fallback.nature),
  culture: scoreFromRow(styleRow, ["culture"], fallback.culture),
  activity: scoreFromRow(styleRow, ["activity", "activities"], fallback.activity),
  relaxed: scoreFromRow(styleRow, ["relaxed", "relax", "relaxation"], fallback.relaxed),
  photo: scoreFromRow(styleRow, ["photo", "photo_sns", "sns", "instagram"], fallback.photo),
  localExperience: scoreFromRow(styleRow, ["local_experience", "localExperience", "local"], fallback.localExperience),
});

const deriveCompanionScores = (styleScores: StyleScores, ...texts: string[]): CompanionScores => {
  const combinedText = texts.join(" ");
  return {
    solo: clampScore(3 + (styleScores.localExperience >= 4 ? 1 : 0)),
    couple: clampScore(3 + (styleScores.relaxed >= 4 || styleScores.photo >= 4 ? 1 : 0)),
    friends: clampScore(3 + (styleScores.shopping >= 4 || styleScores.activity >= 4 ? 1 : 0)),
    family: clampScore(3 + (styleScores.culture >= 4 || styleScores.nature >= 4 ? 1 : 0)),
    parents: clampScore(
      3 +
        (styleScores.culture >= 4 || styleScores.relaxed >= 4 ? 1 : 0) -
        (includesAny(combinedText, ["트레킹", "hiking", "diving", "safari"]) ? 1 : 0),
    ),
  };
};

const buildCompanionScores = (companionRow: SheetRecord | undefined, fallback: CompanionScores): CompanionScores => ({
  solo: scoreFromRow(companionRow, ["solo"], fallback.solo),
  couple: scoreFromRow(companionRow, ["couple"], fallback.couple),
  friends: scoreFromRow(companionRow, ["friends", "friend"], fallback.friends),
  family: scoreFromRow(companionRow, ["family"], fallback.family),
  parents: scoreFromRow(companionRow, ["parents", "parent"], fallback.parents),
});

const buildClimateByMonth = (climateRow?: SheetRecord): Record<number, MonthlyClimate> => {
  const climateByMonth: Record<number, MonthlyClimate> = {};
  if (!climateRow) return climateByMonth;

  for (let month = 1; month <= 12; month += 1) {
    const suffix = String(month).padStart(2, "0");
    climateByMonth[month] = {
      avgTempC: numberValue(climateRow[`avg_temp_c_${suffix}`]),
      rainfallMm: numberValue(climateRow[`rainfall_mm_${suffix}`]),
    };
  }

  return climateByMonth;
};

const primaryAirportForCity = (airportRows: SheetRecord[] | undefined, fallbackAirport: string): string => {
  if (!airportRows || airportRows.length === 0) return fallbackAirport;
  const primaryAirport = airportRows.find((row) => booleanValue(row.is_primary)) ?? airportRows[0];
  return text(primaryAirport.airport_code) || fallbackAirport;
};

const currencyFromRow = (row: SheetRecord | undefined): BudgetCurrency => {
  const currency = pickText(row, ["currency", "currency_code", "budget_currency"]).toUpperCase();
  if (currency === "JPY" || currency === "USD") return currency;
  return "KRW";
};

const flightRangeForOrigin = (costRow: SheetRecord | undefined, origin: string): CostRange | undefined => {
  const lower = origin.toLowerCase();
  return pickRange(
    costRow,
    [`flight_cost_from_${lower}_min_krw`, `${lower}_flight_cost_min_krw`, `${lower}_flight_min_krw`, ...(origin === "ICN" ? ["flight_cost_min_krw"] : [])],
    [`flight_cost_from_${lower}_max_krw`, `${lower}_flight_cost_max_krw`, `${lower}_flight_max_krw`, ...(origin === "ICN" ? ["flight_cost_max_krw"] : [])],
    [`flight_cost_from_${lower}_avg_krw`, `${lower}_flight_cost_avg_krw`, `${lower}_flight_avg_krw`, ...(origin === "ICN" ? ["flight_cost_avg_krw", "flight_avg_krw"] : [])],
  );
};

const buildCostProfile = (costRow: SheetRecord | undefined): CostProfile => {
  if (!costRow) {
    return {
      currency: "KRW",
      note: "Cost_Profiles row is missing, so cost feasibility is calculated as a neutral fallback.",
    };
  }

  const flightCostRangeByOrigin: Record<string, CostRange> = {};
  for (const origin of originCodes) {
    const range = flightRangeForOrigin(costRow, origin);
    if (range) flightCostRangeByOrigin[origin] = range;
  }

  const hotelPerNightRange = pickRange(
    costRow,
    ["hotel_per_night_min_krw", "hotel_min_krw", "accommodation_min_krw", "lodging_min_krw"],
    ["hotel_per_night_max_krw", "hotel_max_krw", "accommodation_max_krw", "lodging_max_krw"],
    ["hotel_per_night_avg_krw", "hotel_avg_krw", "accommodation_avg_krw", "lodging_avg_krw"],
  );

  const directDailyRange = pickRange(
    costRow,
    ["daily_local_cost_min_krw", "daily_cost_min_krw", "daily_stay_cost_min_krw", "daily_stay_min_krw"],
    ["daily_local_cost_max_krw", "daily_cost_max_krw", "daily_stay_cost_max_krw", "daily_stay_max_krw"],
    ["daily_local_cost_avg_krw", "daily_cost_avg_krw", "daily_stay_cost_avg_krw", "daily_stay_avg_krw"],
  );

  const transportRange = pickRange(
    costRow,
    ["local_transport_min_krw", "transport_min_krw"],
    ["local_transport_max_krw", "transport_max_krw"],
    ["local_transport_avg_krw", "transport_avg_krw"],
  );

  const dailyLocalCostRange =
    directDailyRange && transportRange
      ? ([directDailyRange[0] + transportRange[0], directDailyRange[1] + transportRange[1]] as CostRange)
      : directDailyRange;

  const note = pickText(costRow, ["budget_note", "cost_note", "note", "source_note"]);
  const pricingSource = pickText(costRow, ["pricing_source", "data_status", "source"]);
  const lastFetchedAt = pickText(costRow, ["last_fetched_at", "last_updated", "updated_at"]);

  return {
    flightCostRangeFromICN: flightCostRangeByOrigin.ICN,
    flightCostRangeFromGMP: flightCostRangeByOrigin.GMP,
    flightCostRangeFromNRT: flightCostRangeByOrigin.NRT,
    flightCostRangeFromKIX: flightCostRangeByOrigin.KIX,
    flightCostRangeByOrigin,
    hotelPerNightRange,
    dailyLocalCostRange,
    currency: currencyFromRow(costRow),
    note: note || "Cost profile loaded from Google Sheets Cost_Profiles.",
    pricingSource: pricingSource || "google_sheets",
    lastFetchedAt: lastFetchedAt || undefined,
  };
};

const flightTimeForOrigin = (rows: Array<SheetRecord | undefined>, origin: string): number | undefined => {
  const lower = origin.toLowerCase();
  const value = pickNumberFromRows(rows, [
    `flight_time_hours_from_${lower}`,
    `flight_time_from_${lower}_hours`,
    `${lower}_flight_time_hours`,
    `${lower}_flight_hours`,
    ...(origin === "ICN" ? ["flight_time_hours", "flight_hours"] : []),
  ]);
  return value ?? undefined;
};

const buildFlightTimeProfile = (...rows: Array<SheetRecord | undefined>): FlightTimeProfile | undefined => {
  const flightTimeHoursByOrigin: Record<string, number> = {};
  for (const origin of originCodes) {
    const hours = flightTimeForOrigin(rows, origin);
    if (typeof hours === "number" && Number.isFinite(hours)) flightTimeHoursByOrigin[origin] = hours;
  }

  if (Object.keys(flightTimeHoursByOrigin).length === 0) return undefined;

  return {
    flightTimeHoursFromICN: flightTimeHoursByOrigin.ICN,
    flightTimeHoursFromGMP: flightTimeHoursByOrigin.GMP,
    flightTimeHoursFromNRT: flightTimeHoursByOrigin.NRT,
    flightTimeHoursFromKIX: flightTimeHoursByOrigin.KIX,
    flightTimeHoursByOrigin,
    note: pickTextFromRows(rows, ["flight_time_note", "route_note"]),
  };
};

const toDestination = (
  baseRow: SheetRecord,
  relatedRows: {
    airportRows?: SheetRecord[];
    climateRow?: SheetRecord;
    introRow?: SheetRecord;
    seasonRow?: SheetRecord;
    landmarkRow?: SheetRecord;
    costRow?: SheetRecord;
    styleRow?: SheetRecord;
    companionRow?: SheetRecord;
  },
): Destination => {
  const cityId = text(baseRow.city_id);
  const cityName = text(baseRow.city_name) || text(relatedRows.introRow?.city_name);
  const country = text(baseRow.country) || text(relatedRows.introRow?.country);
  const shortIntroKo =
    text(relatedRows.introRow?.short_intro_ko) || `${cityName}은(는) ${country}의 여행 후보 도시입니다.`;
  const keywordsKo = parseList(relatedRows.introRow?.travel_keywords_ko);
  const landmarks = parseList(relatedRows.landmarkRow?.landmarks, "|");
  const derivedStyleScores = deriveStyleScores(shortIntroKo, keywordsKo.join(" "), landmarks.join(" "));
  const styleScores = buildStyleScores(relatedRows.styleRow, derivedStyleScores);
  const derivedCompanionScores = deriveCompanionScores(styleScores, shortIntroKo, keywordsKo.join(" "), landmarks.join(" "));

  return {
    cityId,
    cityName,
    country,
    region: text(baseRow.region),
    mainAirport: primaryAirportForCity(relatedRows.airportRows, text(baseRow.main_airport)),
    timezone: text(baseRow.timezone_iana) || text(baseRow.utc_offset_standard),

    shortIntroKo,
    keywordsKo,

    recommendedNights: {
      min: numberValue(relatedRows.introRow?.min_recommended_nights, 2) ?? 2,
      ideal: numberValue(relatedRows.introRow?.ideal_recommended_nights, 3) ?? 3,
      max: numberValue(relatedRows.introRow?.max_recommended_nights, 5) ?? 5,
    },

    seasons: {
      bestMonths: parseMonthList(relatedRows.seasonRow?.best_months),
      cautionMonths: parseMonthList(relatedRows.seasonRow?.weather_caution_months),
    },

    climateByMonth: buildClimateByMonth(relatedRows.climateRow),
    costProfile: buildCostProfile(relatedRows.costRow),
    flightTimeProfile: buildFlightTimeProfile(baseRow, relatedRows.introRow, relatedRows.costRow),
    styleScores,
    companionScores: buildCompanionScores(relatedRows.companionRow, derivedCompanionScores),
    imageUrls: {
      card: pickTextFromRows([baseRow, relatedRows.introRow], ["card_image_url", "image_url", "image"]),
      hero: pickTextFromRows([baseRow, relatedRows.introRow], ["hero_image_url", "hero_image"]),
      alt: `${cityName} destination image`,
      source: pickTextFromRows([baseRow, relatedRows.introRow], ["image_source", "photo_source"]),
    },
    landmarks,
    dataQuality: {
      status: text(baseRow.data_status) || "seed",
      needsReview:
        booleanValue(baseRow.needs_review) ||
        booleanValue(relatedRows.introRow?.needs_review) ||
        booleanValue(relatedRows.seasonRow?.needs_review) ||
        booleanValue(relatedRows.landmarkRow?.needs_review) ||
        booleanValue(relatedRows.climateRow?.needs_review) ||
        booleanValue(relatedRows.costRow?.needs_review) ||
        booleanValue(relatedRows.styleRow?.needs_review) ||
        booleanValue(relatedRows.companionRow?.needs_review),
    },
  };
};

export const loadDestinationsFromGoogleSheets = async (
  options: LoadGoogleSheetOptions = {},
): Promise<Destination[]> => {
  const [
    baseRows,
    airportRows,
    climateRows,
    introRows,
    seasonRows,
    landmarkRows,
    costRows,
    styleRows,
    companionRows,
  ] = await Promise.all([
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.citiesBase, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.airports, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.climate, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.intros, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.seasons, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.landmarks, options),
    fetchOptionalGoogleSheetTab(GOOGLE_SHEET_TABS.costProfiles, options),
    fetchOptionalGoogleSheetTab(GOOGLE_SHEET_TABS.styleScores, options),
    fetchOptionalGoogleSheetTab(GOOGLE_SHEET_TABS.companionScores, options),
  ]);

  const airportsByCityId = groupByCityId(airportRows);
  const climateByCityId = indexByCityId(climateRows);
  const introByCityId = indexByCityId(introRows);
  const seasonByCityId = indexByCityId(seasonRows);
  const landmarkByCityId = indexByCityId(landmarkRows);
  const costByCityId = indexByCityId(costRows);
  const styleByCityId = indexByCityId(styleRows);
  const companionByCityId = indexByCityId(companionRows);

  return baseRows
    .filter((baseRow) => text(baseRow.city_id))
    .map((baseRow) =>
      toDestination(baseRow, {
        airportRows: airportsByCityId.get(text(baseRow.city_id)),
        climateRow: climateByCityId.get(text(baseRow.city_id)),
        introRow: introByCityId.get(text(baseRow.city_id)),
        seasonRow: seasonByCityId.get(text(baseRow.city_id)),
        landmarkRow: landmarkByCityId.get(text(baseRow.city_id)),
        costRow: costByCityId.get(text(baseRow.city_id)),
        styleRow: styleByCityId.get(text(baseRow.city_id)),
        companionRow: companionByCityId.get(text(baseRow.city_id)),
      }),
    );
};
