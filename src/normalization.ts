import type { Destination, StyleScores, CompanionScores } from "./types";

type SheetDestinationRow = Record<string, string | number | boolean | null | undefined>;

const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const toNumberValue = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBooleanValue = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  const text = toStringValue(value).toLowerCase();
  return text === "true" || text === "yes" || text === "y" || text === "1";
};

const toStringList = (value: unknown): string[] => {
  return toStringValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const toNumberList = (value: unknown): number[] => {
  return toStringList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
};

const toScore = (value: unknown): number => {
  const score = toNumberValue(value, 3);
  return Math.max(1, Math.min(5, score));
};

const buildStyleScores = (row: SheetDestinationRow): StyleScores => ({
  budget: toScore(row.budget),
  food: toScore(row.food),
  shopping: toScore(row.shopping),
  nature: toScore(row.nature),
  culture: toScore(row.culture),
  activity: toScore(row.activity),
  relaxed: toScore(row.relaxed),
  photo: toScore(row.photo),
  localExperience: toScore(row.local_experience),
});

const buildCompanionScores = (row: SheetDestinationRow): CompanionScores => ({
  solo: toScore(row.solo),
  couple: toScore(row.couple),
  friends: toScore(row.friends),
  family: toScore(row.family),
  parents: toScore(row.parents),
});

export const normalizeDestinationRow = (row: SheetDestinationRow): Destination => {
  const cityId = toStringValue(row.city_id);

  if (!cityId) {
    throw new Error("city_id is required to normalize a destination row.");
  }

  return {
    cityId,
    cityName: toStringValue(row.city_name_ko),
    country: toStringValue(row.country_ko),
    region: toStringValue(row.region),
    mainAirport: toStringValue(row.main_airport),
    timezone: toStringValue(row.timezone),

    shortIntroKo: toStringValue(row.short_intro_ko),
    keywordsKo: toStringList(row.keywords_ko),

    recommendedNights: {
      min: toNumberValue(row.min_nights, 2),
      ideal: toNumberValue(row.ideal_nights, 3),
      max: toNumberValue(row.max_nights, 5),
    },

    seasons: {
      bestMonths: toNumberList(row.best_months),
      cautionMonths: toNumberList(row.caution_months),
    },

    climateByMonth: {},

    costProfile: {
      flightCostRangeFromICN: [
        toNumberValue(row.flight_cost_min),
        toNumberValue(row.flight_cost_max),
      ],
      hotelPerNightRange: [
        toNumberValue(row.hotel_per_night_min),
        toNumberValue(row.hotel_per_night_max),
      ],
      dailyLocalCostRange: [
        toNumberValue(row.daily_local_cost_min),
        toNumberValue(row.daily_local_cost_max),
      ],
      currency: "KRW",
      note: toStringValue(row.cost_note),
    },

    styleScores: buildStyleScores(row),
    companionScores: buildCompanionScores(row),

    landmarks: toStringList(row.landmarks),

    dataQuality: {
      status: toStringValue(row.data_status) || "draft",
      needsReview: toBooleanValue(row.needs_review),
    },
  };
};

export const normalizeDestinationRows = (rows: SheetDestinationRow[]): Destination[] => {
  return rows.map(normalizeDestinationRow);
};
