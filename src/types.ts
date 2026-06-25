export type BudgetCurrency = "KRW" | "JPY" | "USD";

export type BudgetUnit = "per_person" | "total";

export type CompanionType =
  | "solo"
  | "couple"
  | "friends"
  | "family"
  | "parents";

export type BucketType = "good" | "borderline" | "difficult";

export type StyleTag =
  | "budget"
  | "food"
  | "shopping"
  | "nature"
  | "culture"
  | "activity"
  | "relaxed"
  | "photo"
  | "localExperience";

export type UserTripCondition = {
  departureCity: string;
  travelMonth: number;
  durationDays: number;
  nights: number;
  budgetAmount: number;
  budgetCurrency: BudgetCurrency;
  budgetUnit: BudgetUnit;
  companionType: CompanionType;
  flightTimeToleranceHours: number | null;
  styleTags: StyleTag[];
  mustHaveConditions: string[];
  avoidConditions: string[];
};

export type MonthlyClimate = {
  avgTempC: number | null;
  rainfallMm: number | null;
  climateNote?: string;
};

export type CostRange = [number, number];

export type CostProfile = {
  flightCostRangeFromICN?: CostRange;
  hotelPerNightRange?: CostRange;
  dailyLocalCostRange?: CostRange;
  currency?: BudgetCurrency;
  note?: string;
  pricingSource?: "manual_seed" | "amadeus_live" | "amadeus_cached" | "mixed" | string;
  lastFetchedAt?: string;
  sampleSize?: {
    flights?: number;
    hotels?: number;
  };
};

export type StyleScores = Record<StyleTag, number>;

export type CompanionScores = Record<CompanionType, number>;

export type DestinationImageUrls = {
  card?: string;
  hero?: string;
  alt?: string;
  source?: string;
};

export type Destination = {
  cityId: string;
  cityName: string;
  country: string;
  region: string;
  mainAirport: string;
  timezone: string;

  shortIntroKo: string;
  keywordsKo: string[];

  recommendedNights: {
    min: number;
    ideal: number;
    max: number;
  };

  seasons: {
    bestMonths: number[];
    cautionMonths: number[];
  };

  climateByMonth: Record<number, MonthlyClimate>;

  costProfile: CostProfile;

  styleScores: StyleScores;

  companionScores: CompanionScores;

  imageUrls?: DestinationImageUrls;

  landmarks: string[];

  dataQuality: {
    status: "draft" | "reviewed" | "verified" | string;
    needsReview: boolean;
  };
};

export type DestinationScoreBreakdown = {
  feasibility: number;
  seasonAndWeatherFit: number;
  durationFit: number;
  styleFit: number;
  companionFit: number;
  cautionPenalty: number;
};

export type ScoredDestination = {
  destination: Destination;
  score: number;
  starRating: 1 | 2 | 3 | 4 | 5;
  bucket: BucketType;
  reasons: string[];
  cautions: string[];
  estimatedCostRange: CostRange | null;
  breakdown: DestinationScoreBreakdown;
};
