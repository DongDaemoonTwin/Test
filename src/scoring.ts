import type {
  BudgetCurrency,
  CostProfile,
  CostRange,
  Destination,
  DestinationScoreBreakdown,
  FitDimension,
  FitStatus,
  ResultExplanation,
  ScoredDestination,
  StyleTag,
  UserTripCondition,
} from "./types";

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const average = (values: number[]): number => {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const normalizeOriginCode = (origin: string): string => origin.trim().toUpperCase();

const lookupByOrigin = <T>(values: Record<string, T> | undefined, origin: string): T | undefined => {
  if (!values) return undefined;
  const originCode = normalizeOriginCode(origin);
  const exactValue = values[originCode];
  if (exactValue !== undefined) return exactValue;

  return Object.entries(values).find(([key]) => normalizeOriginCode(key) === originCode)?.[1];
};

const moneyToKrwRate: Record<BudgetCurrency, number> = {
  KRW: 1,
  JPY: 9,
  USD: 1400,
};

const convertMoney = (value: number, fromCurrency: BudgetCurrency, toCurrency: BudgetCurrency): number => {
  if (fromCurrency === toCurrency) return value;
  return (value * moneyToKrwRate[fromCurrency]) / moneyToKrwRate[toCurrency];
};

const convertMoneyRange = (
  range: CostRange | undefined,
  fromCurrency: BudgetCurrency | undefined,
  toCurrency: BudgetCurrency,
): CostRange | undefined => {
  if (!range) return undefined;
  const sourceCurrency = fromCurrency ?? toCurrency;
  return [convertMoney(range[0], sourceCurrency, toCurrency), convertMoney(range[1], sourceCurrency, toCurrency)];
};

export const getFlightCostRangeForOrigin = (
  costProfile: CostProfile,
  departureCity: string,
  targetCurrency: BudgetCurrency = costProfile.currency ?? "KRW",
): CostRange | undefined => {
  const originCode = normalizeOriginCode(departureCity);
  const byOrigin = lookupByOrigin(costProfile.flightCostRangeByOrigin, originCode);
  const byOriginCurrency = lookupByOrigin(costProfile.flightCostCurrencyByOrigin, originCode);

  if (byOrigin) {
    return convertMoneyRange(byOrigin, byOriginCurrency ?? costProfile.currency ?? targetCurrency, targetCurrency);
  }

  if (originCode === "ICN") {
    return convertMoneyRange(costProfile.flightCostRangeFromICN, byOriginCurrency ?? costProfile.currency, targetCurrency);
  }
  if (originCode === "GMP") {
    return convertMoneyRange(costProfile.flightCostRangeFromGMP, byOriginCurrency ?? costProfile.currency, targetCurrency);
  }
  if (originCode === "NRT") {
    return convertMoneyRange(costProfile.flightCostRangeFromNRT, byOriginCurrency ?? costProfile.currency, targetCurrency);
  }
  if (originCode === "KIX") {
    return convertMoneyRange(costProfile.flightCostRangeFromKIX, byOriginCurrency ?? costProfile.currency, targetCurrency);
  }

  return undefined;
};

export const getFlightTimeHoursForOrigin = (
  destination: Destination,
  departureCity: string,
): number | null => {
  const originCode = normalizeOriginCode(departureCity);
  const profile = destination.flightTimeProfile;

  if (!profile) return null;

  const byOrigin = lookupByOrigin(profile.flightTimeHoursByOrigin, originCode);
  if (typeof byOrigin === "number" && Number.isFinite(byOrigin)) return byOrigin;

  if (originCode === "ICN") return profile.flightTimeHoursFromICN ?? null;
  if (originCode === "GMP") return profile.flightTimeHoursFromGMP ?? null;
  if (originCode === "NRT") return profile.flightTimeHoursFromNRT ?? null;
  if (originCode === "KIX") return profile.flightTimeHoursFromKIX ?? null;

  return null;
};

export const getDirectFlightAvailableForOrigin = (
  destination: Destination,
  departureCity: string,
): boolean | null => {
  const value = lookupByOrigin(destination.flightTimeProfile?.directFlightAvailableByOrigin, departureCity);
  return typeof value === "boolean" ? value : null;
};

export const estimateTotalCostRange = (
  destination: Destination,
  condition: UserTripCondition,
): CostRange | null => {
  const { costProfile } = destination;
  const targetCurrency = condition.budgetCurrency;
  const flight = getFlightCostRangeForOrigin(costProfile, condition.departureCity, targetCurrency);
  const hotel = convertMoneyRange(
    costProfile.hotelPerNightRange,
    costProfile.hotelPerNightCurrency ?? costProfile.currency,
    targetCurrency,
  );
  const daily = convertMoneyRange(
    costProfile.dailyLocalCostRange,
    costProfile.dailyLocalCostCurrency ?? costProfile.currency,
    targetCurrency,
  );

  if (!flight || !hotel || !daily) {
    return null;
  }

  const min = flight[0] + hotel[0] * condition.nights + daily[0] * condition.durationDays;
  const max = flight[1] + hotel[1] * condition.nights + daily[1] * condition.durationDays;

  return [min, max];
};

const normalizeBudget = (condition: UserTripCondition): number => {
  return condition.budgetAmount;
};

export const calculateFeasibility = (
  destination: Destination,
  condition: UserTripCondition,
): number => {
  const estimatedCostRange = estimateTotalCostRange(destination, condition);

  if (!estimatedCostRange) {
    return 50;
  }

  const budget = normalizeBudget(condition);
  const [estimatedMin, estimatedMax] = estimatedCostRange;

  if (budget >= estimatedMax * 0.95) return 100;
  if (budget >= estimatedMin * 0.9) return 75;

  const ratio = budget / estimatedMin;
  return clamp(Math.round(ratio * 70), 0, 70);
};

export const calculateSeasonAndWeatherFit = (
  destination: Destination,
  condition: UserTripCondition,
): number => {
  const month = condition.travelMonth;

  if (destination.seasons.bestMonths.includes(month)) {
    return 100;
  }

  if (destination.seasons.cautionMonths.includes(month)) {
    return 45;
  }

  return 70;
};

export const calculateDurationFit = (
  destination: Destination,
  condition: UserTripCondition,
): number => {
  const { min, ideal, max } = destination.recommendedNights;
  const nights = condition.nights;

  if (nights === ideal) return 100;
  if (nights >= min && nights <= max) return 80;
  if (nights === min - 1 || nights === max + 1) return 60;
  if (nights < min) return 45;
  return 60;
};

export const calculateStyleFit = (
  destination: Destination,
  condition: UserTripCondition,
): number => {
  const selectedTags = condition.styleTags;

  if (selectedTags.length === 0) {
    return 60;
  }

  const scores = selectedTags.map((tag: StyleTag) => destination.styleScores[tag] ?? 3);
  return clamp(Math.round((average(scores) / 5) * 100), 0, 100);
};

export const calculateCompanionFit = (
  destination: Destination,
  condition: UserTripCondition,
): number => {
  const rawScore = destination.companionScores[condition.companionType] ?? 3;
  return clamp(Math.round((rawScore / 5) * 100), 0, 100);
};

export const calculateFlightTimeFit = (
  destination: Destination,
  condition: UserTripCondition,
): number => {
  const toleranceHours = condition.flightTimeToleranceHours;
  const flightTimeHours = getFlightTimeHoursForOrigin(destination, condition.departureCity);

  if (toleranceHours === null) {
    return flightTimeHours === null ? 80 : 100;
  }

  if (flightTimeHours === null) {
    return 60;
  }

  if (flightTimeHours <= toleranceHours) return 100;
  if (flightTimeHours <= toleranceHours + 2) return 75;
  if (flightTimeHours <= toleranceHours + 3.5) return 45;
  return 20;
};

export const calculateCautionPenalty = (
  destination: Destination,
  condition: UserTripCondition,
): number => {
  let penalty = 0;

  const keywordText = destination.keywordsKo.join(" ");
  const introText = destination.shortIntroKo;
  const combinedText = `${keywordText} ${introText}`;

  for (const avoidCondition of condition.avoidConditions) {
    if (combinedText.includes(avoidCondition)) {
      penalty += 8;
    }
  }

  if (destination.dataQuality.needsReview) {
    penalty += 3;
  }

  if (destination.seasons.cautionMonths.includes(condition.travelMonth)) {
    penalty += 8;
  }

  return penalty;
};

export const calculateScoreBreakdown = (
  destination: Destination,
  condition: UserTripCondition,
): DestinationScoreBreakdown => {
  return {
    feasibility: calculateFeasibility(destination, condition),
    seasonAndWeatherFit: calculateSeasonAndWeatherFit(destination, condition),
    durationFit: calculateDurationFit(destination, condition),
    styleFit: calculateStyleFit(destination, condition),
    companionFit: calculateCompanionFit(destination, condition),
    flightTimeFit: calculateFlightTimeFit(destination, condition),
    cautionPenalty: calculateCautionPenalty(destination, condition),
  };
};

export const calculateFinalScore = (breakdown: DestinationScoreBreakdown): number => {
  const score =
    breakdown.feasibility * 0.28 +
    breakdown.seasonAndWeatherFit * 0.18 +
    breakdown.durationFit * 0.15 +
    breakdown.styleFit * 0.18 +
    breakdown.companionFit * 0.09 +
    breakdown.flightTimeFit * 0.12 -
    breakdown.cautionPenalty;

  return clamp(Math.round(score), 0, 100);
};

export const toStarRating = (score: number): 1 | 2 | 3 | 4 | 5 => {
  if (score >= 85) return 5;
  if (score >= 70) return 4;
  if (score >= 55) return 3;
  if (score >= 40) return 2;
  return 1;
};

export const toBucket = (score: number): "good" | "borderline" | "difficult" => {
  if (score >= 70) return "good";
  if (score >= 50) return "borderline";
  return "difficult";
};

const formatFlightTime = (hours: number): string => {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
};

const formatKrw = (value: number): string => `KRW ${Math.round(value).toLocaleString("en-US")}`;

const selectedStyleLabel = (condition: UserTripCondition): string => {
  if (condition.styleTags.length === 0) return "selected style";
  return condition.styleTags.map((tag) => tag.replace(/([A-Z])/g, " $1").toLowerCase()).join(" + ");
};

const statusFromScore = (score: number): FitStatus => {
  if (score >= 75) return "good";
  if (score >= 55) return "borderline";
  return "difficult";
};

const dimensionText = (dimension: FitDimension): string | undefined => {
  if (dimension.status === "good") return dimension.goodText;
  if (dimension.status === "borderline") return dimension.borderlineText;
  if (dimension.status === "difficult") return dimension.difficultText;
  return undefined;
};

const buildDimensions = (
  destination: Destination,
  condition: UserTripCondition,
  breakdown: DestinationScoreBreakdown,
  estimatedCostRange: CostRange | null,
): FitDimension[] => {
  const budget = normalizeBudget(condition);
  const flightTimeHours = getFlightTimeHoursForOrigin(destination, condition.departureCity);
  const directFlightAvailable = getDirectFlightAvailableForOrigin(destination, condition.departureCity);
  const { min, max } = destination.recommendedNights;
  const styleName = selectedStyleLabel(condition);
  const costValueText = estimatedCostRange
    ? `${formatKrw(estimatedCostRange[0])}–${formatKrw(estimatedCostRange[1])}`
    : "Missing estimate";

  const budgetStatus: FitStatus = !estimatedCostRange
    ? "unknown"
    : budget >= estimatedCostRange[1] * 0.95
      ? "good"
      : budget >= estimatedCostRange[0] * 0.9
        ? "borderline"
        : "difficult";

  const flightStatus: FitStatus =
    condition.flightTimeToleranceHours === null
      ? "no_limit"
      : flightTimeHours === null
        ? "unknown"
        : flightTimeHours <= condition.flightTimeToleranceHours
          ? "good"
          : flightTimeHours <= condition.flightTimeToleranceHours + 2
            ? "borderline"
            : "difficult";

  const durationStatus: FitStatus =
    condition.nights >= min && condition.nights <= max
      ? "good"
      : condition.nights === min - 1 || condition.nights === max + 1
        ? "borderline"
        : "difficult";

  const seasonStatus: FitStatus = destination.seasons.bestMonths.includes(condition.travelMonth)
    ? "good"
    : destination.seasons.cautionMonths.includes(condition.travelMonth)
      ? "difficult"
      : "borderline";

  const directStatus: FitStatus = directFlightAvailable === true ? "good" : directFlightAvailable === false ? "difficult" : "unknown";

  return [
    {
      key: "budget",
      label: "Budget",
      status: budgetStatus,
      valueText: costValueText,
      goodText: `Estimated total is likely within your ${formatKrw(budget)} budget.`,
      borderlineText: `Possible with cheaper flights or stays, but normal prices can exceed ${formatKrw(budget)}.`,
      difficultText: `Estimated cost is materially above your ${formatKrw(budget)} budget.`,
    },
    {
      key: "flight",
      label: "Flight time",
      status: flightStatus,
      valueText: flightTimeHours === null ? "Unknown" : formatFlightTime(flightTimeHours),
      goodText: flightTimeHours === null ? undefined : `Flight time is about ${formatFlightTime(flightTimeHours)}, within your tolerance.`,
      borderlineText: flightTimeHours === null ? undefined : `Flight time is about ${formatFlightTime(flightTimeHours)}, slightly above your comfort range.`,
      difficultText: flightTimeHours === null ? undefined : `Flight time is about ${formatFlightTime(flightTimeHours)}, too long for this condition.`,
    },
    {
      key: "duration",
      label: "Trip length",
      status: durationStatus,
      valueText: `${condition.nights} nights`,
      goodText: `${condition.nights} nights fits the recommended ${min}–${max} night range.`,
      borderlineText: `${condition.nights} nights is close, but not ideal for this destination.`,
      difficultText: `${condition.nights} nights does not fit the recommended ${min}–${max} night range.`,
    },
    {
      key: "season",
      label: "Season",
      status: seasonStatus,
      valueText: `Month ${condition.travelMonth}`,
      goodText: `Month ${condition.travelMonth} is one of the better months to visit.`,
      borderlineText: `Month ${condition.travelMonth} is usable, but not the strongest season.`,
      difficultText: `Month ${condition.travelMonth} has weather or season risk.`,
    },
    {
      key: "style",
      label: "Style fit",
      status: condition.styleTags.length === 0 ? "unknown" : statusFromScore(breakdown.styleFit),
      valueText: `${breakdown.styleFit}/100`,
      goodText: `Strong match for ${styleName} travel.`,
      borderlineText: `Acceptable but not outstanding for ${styleName} travel.`,
      difficultText: `Weak match for ${styleName} travel.`,
    },
    {
      key: "companion",
      label: "Companion fit",
      status: statusFromScore(breakdown.companionFit),
      valueText: `${breakdown.companionFit}/100`,
      goodText: `Good fit for ${condition.companionType} travel.`,
      borderlineText: `Okay, but not especially strong for ${condition.companionType} travel.`,
      difficultText: `Not a strong fit for ${condition.companionType} travel.`,
    },
    {
      key: "direct",
      label: "Direct route",
      status: directStatus,
      valueText: directFlightAvailable === true ? "Likely direct" : directFlightAvailable === false ? "Transfer likely" : "Needs check",
      goodText: "Direct-flight availability looks likely from the selected departure airport.",
      difficultText: "A transfer may be required from the selected departure airport.",
    },
  ];
};

const buildResultExplanation = (
  destination: Destination,
  condition: UserTripCondition,
  breakdown: DestinationScoreBreakdown,
  estimatedCostRange: CostRange | null,
): ResultExplanation => {
  const dimensions = buildDimensions(destination, condition, breakdown, estimatedCostRange);
  const goodPoints = dimensions
    .filter((dimension) => dimension.status === "good" || dimension.status === "no_limit")
    .map(dimensionText)
    .filter((value): value is string => Boolean(value));
  const borderlinePoints = dimensions
    .filter((dimension) => dimension.status === "borderline")
    .map(dimensionText)
    .filter((value): value is string => Boolean(value));
  const difficultPoints = dimensions
    .filter((dimension) => dimension.status === "difficult")
    .map(dimensionText)
    .filter((value): value is string => Boolean(value));

  const missingData = dimensions.filter((dimension) => dimension.status === "unknown").map((dimension) => dimension.label);
  const confidence = missingData.length > 1 ? "low" : destination.mvp?.visible ? "medium" : "low";
  const blockingIssue = [
    missingData.length ? `missing ${missingData.join(", ")}` : "",
    destination.costProfile.pricingSource?.includes("static") ? "live prices not connected" : "",
    destination.dataQuality.needsReview ? "seed data needs review" : "",
  ]
    .filter(Boolean)
    .join("; ");

  const summary =
    difficultPoints.length > 0
      ? `${destination.cityName} has real strengths, but ${difficultPoints[0].replace(/\.$/, "").toLowerCase()} under this condition.`
      : borderlinePoints.length > 0
        ? `${destination.cityName} is possible, but ${borderlinePoints[0].replace(/\.$/, "").toLowerCase()}.`
        : `${destination.cityName} is a strong fit for this condition.`;

  return {
    goodPoints,
    borderlinePoints,
    difficultPoints,
    dimensions,
    summary,
    confidence,
    blockingIssue,
  };
};

const bucketFromExplanation = (score: number, explanation: ResultExplanation): "good" | "borderline" | "difficult" => {
  const hardBlockers = explanation.dimensions.filter(
    (dimension) =>
      dimension.status === "difficult" &&
      (dimension.key === "budget" || dimension.key === "flight" || dimension.key === "duration"),
  );
  const borderlineCount = explanation.dimensions.filter((dimension) => dimension.status === "borderline").length;

  if (hardBlockers.length > 0) return "difficult";
  if (explanation.difficultPoints.length > 0 || borderlineCount >= 2) return "borderline";
  return toBucket(score);
};

const buildReasons = (explanation: ResultExplanation): string[] => {
  return explanation.goodPoints.length ? explanation.goodPoints : [explanation.summary];
};

const buildCautions = (explanation: ResultExplanation): string[] => {
  const cautions = [...explanation.borderlinePoints, ...explanation.difficultPoints];
  if (explanation.blockingIssue) cautions.push(explanation.blockingIssue);
  return cautions.length ? cautions : ["No major caution in the current data."];
};

export const scoreDestination = (
  destination: Destination,
  condition: UserTripCondition,
): ScoredDestination => {
  const breakdown = calculateScoreBreakdown(destination, condition);
  const score = calculateFinalScore(breakdown);
  const estimatedCostRange = estimateTotalCostRange(destination, condition);
  const explanation = buildResultExplanation(destination, condition, breakdown, estimatedCostRange);

  return {
    destination,
    score,
    starRating: toStarRating(score),
    bucket: bucketFromExplanation(score, explanation),
    reasons: buildReasons(explanation),
    cautions: buildCautions(explanation),
    estimatedCostRange,
    breakdown,
    explanation,
  };
};

export const scoreDestinations = (
  destinations: Destination[],
  condition: UserTripCondition,
): ScoredDestination[] => {
  return destinations
    .map((destination) => scoreDestination(destination, condition))
    .sort((a, b) => b.score - a.score);
};
