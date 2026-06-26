export type BudgetCurrency = "KRW" | "JPY" | "USD";

export type BudgetUnit = "per_person" | "total";

export type CompanionType =
  | "solo"
  | "couple"
  | "friends"
  | "family"
  | "parents"
  | "children";

export type BucketType = "good" | "borderline" | "difficult";

export type CoreStyleTag =
  | "budget"
  | "food"
  | "shopping"
  | "nature"
  | "culture"
  | "activity"
  | "relaxed"
  | "photo"
  | "localExperience";

export type StyleTag = CoreStyleTag | "nightlife" | "familyFriendly" | "firstTimer";

export type FitStatus = "good" | "borderline" | "difficult" | "unknown" | "no_limit";

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
  flightCostRangeFromGMP?: CostRange;
  flightCostRangeFromNRT?: CostRange;
  flightCostRangeFromKIX?: CostRange;
  flightCostRangeByOrigin?: Record<string, CostRange>;
  flightCostCurrencyByOrigin?: Record<string, BudgetCurrency>;
  hotelPerNightRange?: CostRange;
  hotelPerNightCurrency?: BudgetCurrency;
  dailyLocalCostRange?: CostRange;
  dailyLocalCostCurrency?: BudgetCurrency;
  currency?: BudgetCurrency;
  note?: string;
  pricingSource?: "manual_seed" | "amadeus_live" | "amadeus_cached" | "mixed" | string;
  lastFetchedAt?: string;
  sampleSize?: {
    flights?: number;
    hotels?: number;
  };
};

export type FlightTimeProfile = {
  flightTimeHoursFromICN?: number;
  flightTimeHoursFromGMP?: number;
  flightTimeHoursFromNRT?: number;
  flightTimeHoursFromKIX?: number;
  flightTimeHoursByOrigin?: Record<string, number>;
  directFlightAvailableByOrigin?: Record<string, boolean>;
  transferAirportsByOrigin?: Record<string, string[]>;
  note?: string;
};

export type RouteFlightProfile = {
  departureAirport: string;
  arrivalAirport: string;
  fareCurrency?: BudgetCurrency;
  flightCostRange?: CostRange;
  flightDurationHours?: number;
  isDirectAvailable?: boolean;
  typicalTransferAirports?: string[];
  routeConfidence?: string;
  dataStatus?: string;
  needsReview?: boolean;
  sourceNote?: string;
  lastUpdated?: string;
};

export type StyleScores = Record<CoreStyleTag, number> & Partial<Record<Exclude<StyleTag, CoreStyleTag>, number>>;

export type CompanionScores = Record<Exclude<CompanionType, "children">, number> & Partial<Record<"children", number>>;

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

  flightTimeProfile?: FlightTimeProfile;

  routeFlightProfilesByOrigin?: Record<string, RouteFlightProfile>;

  mvp?: {
    visible: boolean;
    priority: number | null;
    targetDepartureMarket: string;
  };

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
  flightTimeFit: number;
  cautionPenalty: number;
};

export type FitDimensionKey = "budget" | "flight" | "duration" | "season" | "style" | "companion" | "direct";

export type FitDimension = {
  key: FitDimensionKey;
  label: string;
  status: FitStatus;
  goodText?: string;
  borderlineText?: string;
  difficultText?: string;
  valueText?: string;
};

export type ResultExplanation = {
  goodPoints: string[];
  borderlinePoints: string[];
  difficultPoints: string[];
  dimensions: FitDimension[];
  summary: string;
  confidence: "high" | "medium" | "low";
  blockingIssue: string;
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
  explanation: ResultExplanation;
};
