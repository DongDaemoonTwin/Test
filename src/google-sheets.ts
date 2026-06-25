import { createSign } from "node:crypto";

import type { CompanionScores, Destination, MonthlyClimate, StyleScores } from "./types";

export const DEFAULT_GOOGLE_SHEET_ID = "1VyIVKXJijMQRJfnRMWXMvcQ0DmRpDDmGPqVKO5Eo8rA";

export const GOOGLE_SHEET_TABS = {
  citiesBase: "Cities_Base",
  airports: "City_Airports",
  climate: "City_Monthly_Climate",
  intros: "City_Intros",
  seasons: "City_Seasons",
  landmarks: "City_Landmarks",
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

let cachedServiceAccountToken: ServiceAccountToken | null = null;

const GOOGLE_SHEETS_READONLY_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

const monthKeys = Array.from({ length: 12 }, (_, index) => {
  const month = index + 1;
  return {
    month,
    suffix: String(month).padStart(2, "0"),
  };
});

const env = (key: string): string => process.env[key]?.trim() ?? "";

const googleSheetAccessMode = (options: LoadGoogleSheetOptions): GoogleSheetAccessMode => {
  const value = options.accessMode ?? env("GOOGLE_SHEETS_ACCESS_MODE") ?? "auto";

  if (value === "public" || value === "service_account" || value === "auto") {
    return value;
  }

  return "auto";
};

const serviceAccountEmail = (): string =>
  env("GOOGLE_SERVICE_ACCOUNT_EMAIL") || env("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL");

const serviceAccountPrivateKey = (): string =>
  (env("GOOGLE_PRIVATE_KEY") || env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || env("GOOGLE_SHEETS_PRIVATE_KEY")).replace(
    /\\n/g,
    "\n",
  );

const hasServiceAccountCredentials = (): boolean => Boolean(serviceAccountEmail() && serviceAccountPrivateKey());

const csvExportUrl = (sheetId: string, sheetName: string): string => {
  const params = new URLSearchParams({
    tqx: "out:csv",
    sheet: sheetName,
  });

  return `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;
};

const sheetsApiValuesUrl = (sheetId: string, sheetName: string): string => {
  const range = `'${sheetName.replace(/'/g, "''")}'!A:ZZZ`;
  const params = new URLSearchParams({
    majorDimension: "ROWS",
    valueRenderOption: "FORMATTED_VALUE",
  });

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
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell.trim());
      cell = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += char;
  }

  row.push(cell.trim());
  if (row.some((value) => value !== "")) {
    rows.push(row);
  }

  return rows;
};

const rowsToRecords = (rows: string[][]): SheetRecord[] => {
  const [headerRow, ...dataRows] = rows;

  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((header) => header.trim());

  return dataRows
    .map((dataRow) => {
      const record: SheetRecord = {};

      headers.forEach((header, index) => {
        if (!header) return;
        record[header] = dataRow[index]?.trim() ?? "";
      });

      return record;
    })
    .filter((record) => Object.values(record).some(Boolean));
};

const base64UrlEncode = (input: string | Buffer): string => Buffer.from(input).toString("base64url");

const createServiceAccountJwt = (): string => {
  const email = serviceAccountEmail();
  const privateKey = serviceAccountPrivateKey();

  if (!email || !privateKey) {
    throw new Error(
      "Google Sheets service account credentials are missing. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: createServiceAccountJwt(),
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

  if (!response.ok) {
    throw new Error(`Failed to fetch public Google Sheet tab ${sheetName}: ${response.status}`);
  }

  const csvText = await response.text();

  if (csvText.trim().startsWith("<")) {
    throw new Error(
      `Google Sheet tab ${sheetName} did not return CSV. Check sharing permissions or sheet name.`,
    );
  }

  return rowsToRecords(parseCsv(csvText));
};

const fetchGoogleSheetTabWithServiceAccount = async (sheetId: string, sheetName: string): Promise<SheetRecord[]> => {
  const accessToken = await getServiceAccountAccessToken();
  const response = await fetch(sheetsApiValuesUrl(sheetId, sheetName), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
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
        "Check that the Google Sheets API is enabled and the spreadsheet is shared with the service account email.",
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
  const accessMode = googleSheetAccessMode(options);

  if (accessMode === "service_account" || (accessMode === "auto" && hasServiceAccountCredentials())) {
    return fetchGoogleSheetTabWithServiceAccount(sheetId, sheetName);
  }

  try {
    return await fetchGoogleSheetTabPublic(sheetId, sheetName);
  } catch (error) {
    throw new Error(
      [
        `Failed to fetch Google Sheet tab ${sheetName}.`,
        error instanceof Error ? error.message : String(error),
        "For Codespaces, either set the spreadsheet to Anyone with the link can view, or use service account env vars:",
        "GOOGLE_SHEETS_ACCESS_MODE=service_account, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY.",
      ].join(" "),
    );
  }
};

const indexByCityId = (rows: SheetRecord[]): Map<string, SheetRecord> => {
  const map = new Map<string, SheetRecord>();

  for (const row of rows) {
    const cityId = text(row.city_id);
    if (cityId) {
      map.set(cityId, row);
    }
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

const text = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const numberValue = (value: unknown, fallback: number | null = null): number | null => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const booleanValue = (value: unknown): boolean => {
  const normalized = text(value).toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
};

const parseMonthList = (value: unknown): number[] => {
  return text(value)
    .split(/[|,]/)
    .map((item) => Number(item.trim()))
    .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12);
};

const parseKeywordList = (value: unknown): string[] => {
  return text(value)
    .split(/[|,]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseLandmarks = (value: unknown): string[] => {
  return text(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
};

const clampScore = (score: number): number => Math.max(1, Math.min(5, score));

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

  if (includesAny(combinedText, ["가성비", "저렴", "budget", "cheap", "backpacker"])) {
    scores.budget = 4;
  }

  if (includesAny(combinedText, ["맛집", "음식", "미식", "food", "cuisine", "restaurant"])) {
    scores.food = 4;
  }

  if (includesAny(combinedText, ["쇼핑", "market", "mall", "shopping", "outlet"])) {
    scores.shopping = 4;
  }

  if (includesAny(combinedText, ["자연", "해변", "산", "섬", "사파리", "national park", "beach", "nature", "island", "mountain"])) {
    scores.nature = 4;
  }

  if (includesAny(combinedText, ["문화", "역사", "박물관", "사원", "성당", "유적", "culture", "history", "museum", "temple", "cathedral"])) {
    scores.culture = 4;
  }

  if (includesAny(combinedText, ["액티비티", "트레킹", "다이빙", "스키", "hiking", "trekking", "diving", "ski", "activity"])) {
    scores.activity = 4;
  }

  if (includesAny(combinedText, ["휴양", "리조트", "온천", "relax", "resort", "spa", "hot spring"])) {
    scores.relaxed = 4;
  }

  if (includesAny(combinedText, ["사진", "야경", "전망", "sns", "photo", "view", "viewpoint", "night view"])) {
    scores.photo = 4;
  }

  if (includesAny(combinedText, ["로컬", "현지", "마을", "시장", "local", "village", "old town"])) {
    scores.localExperience = 4;
  }

  return Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [key, clampScore(value)]),
  ) as StyleScores;
};

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

const buildClimateByMonth = (climateRow?: SheetRecord): Record<number, MonthlyClimate> => {
  const climateByMonth: Record<number, MonthlyClimate> = {};

  if (!climateRow) {
    return climateByMonth;
  }

  for (const { month, suffix } of monthKeys) {
    climateByMonth[month] = {
      avgTempC: numberValue(climateRow[`avg_temp_c_${suffix}`]),
      rainfallMm: numberValue(climateRow[`rainfall_mm_${suffix}`]),
    };
  }

  return climateByMonth;
};

const primaryAirportForCity = (airportRows: SheetRecord[] | undefined, fallbackAirport: string): string => {
  if (!airportRows || airportRows.length === 0) {
    return fallbackAirport;
  }

  const primaryAirport = airportRows.find((row) => booleanValue(row.is_primary)) ?? airportRows[0];
  return text(primaryAirport.airport_code) || fallbackAirport;
};

const toDestination = (
  baseRow: SheetRecord,
  relatedRows: {
    airportRows?: SheetRecord[];
    climateRow?: SheetRecord;
    introRow?: SheetRecord;
    seasonRow?: SheetRecord;
    landmarkRow?: SheetRecord;
  },
): Destination => {
  const cityId = text(baseRow.city_id);
  const cityName = text(baseRow.city_name) || text(relatedRows.introRow?.city_name);
  const country = text(baseRow.country) || text(relatedRows.introRow?.country);
  const shortIntroKo =
    text(relatedRows.introRow?.short_intro_ko) ||
    `${cityName}은(는) ${country}의 여행 후보 도시입니다.`;
  const keywordsKo = parseKeywordList(relatedRows.introRow?.travel_keywords_ko);
  const landmarks = parseLandmarks(relatedRows.landmarkRow?.landmarks);
  const styleScores = deriveStyleScores(shortIntroKo, keywordsKo.join(" "), landmarks.join(" "));

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

    costProfile: {
      currency: "KRW",
      note: "Google Sheets seed DB에는 아직 항공권/숙박/체류비 컬럼이 없어 비용 점수는 중립값으로 계산합니다.",
    },

    styleScores,
    companionScores: deriveCompanionScores(styleScores, shortIntroKo, keywordsKo.join(" "), landmarks.join(" ")),
    landmarks,

    dataQuality: {
      status: text(baseRow.data_status) || "seed",
      needsReview:
        booleanValue(baseRow.needs_review) ||
        booleanValue(relatedRows.introRow?.needs_review) ||
        booleanValue(relatedRows.seasonRow?.needs_review) ||
        booleanValue(relatedRows.landmarkRow?.needs_review) ||
        booleanValue(relatedRows.climateRow?.needs_review),
    },
  };
};

export const loadDestinationsFromGoogleSheets = async (
  options: LoadGoogleSheetOptions = {},
): Promise<Destination[]> => {
  const [baseRows, airportRows, climateRows, introRows, seasonRows, landmarkRows] = await Promise.all([
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.citiesBase, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.airports, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.climate, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.intros, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.seasons, options),
    fetchGoogleSheetTab(GOOGLE_SHEET_TABS.landmarks, options),
  ]);

  const airportsByCityId = groupByCityId(airportRows);
  const climateByCityId = indexByCityId(climateRows);
  const introByCityId = indexByCityId(introRows);
  const seasonByCityId = indexByCityId(seasonRows);
  const landmarkByCityId = indexByCityId(landmarkRows);

  return baseRows
    .filter((baseRow) => text(baseRow.city_id))
    .map((baseRow) =>
      toDestination(baseRow, {
        airportRows: airportsByCityId.get(text(baseRow.city_id)),
        climateRow: climateByCityId.get(text(baseRow.city_id)),
        introRow: introByCityId.get(text(baseRow.city_id)),
        seasonRow: seasonByCityId.get(text(baseRow.city_id)),
        landmarkRow: landmarkByCityId.get(text(baseRow.city_id)),
      }),
    );
};
