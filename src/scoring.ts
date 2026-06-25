import type {
  CostProfile,
  CostRange,
  Destination,
  DestinationScoreBreakdown,
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

export const getFlightCostRangeForOrigin = (
  costProfile: CostProfile,
  departureCity: string,
): CostRange | undefined => {
  const originCode = normalizeOriginCode(departureCity);
  const byOrigin = lookupByOrigin(costProfile.flightCostRangeByOrigin, originCode);
  if (byOrigin) return byOrigin;

  if (originCode === "ICN") return costProfile.flightCostRangeFromICN;
  if (originCode === "GMP") return costProfile.flightCostRangeFromGMP;
  if (originCode === "NRT") return costProfile.flightCostRangeFromNRT;
  if (originCode === "KIX") return costProfile.flightCostRangeFromKIX;

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

export const estimateTotalCostRange = (
  destination: Destination,
  condition: UserTripCondition,
): CostRange | null => {
  const { costProfile } = destination;
  const flight = getFlightCostRangeForOrigin(costProfile, condition.departureCity);
  const hotel = costProfile.hotelPerNightRange;
  const daily = costProfile.dailyLocalCostRange;

  if (!flight || !hotel || !daily) {
    return null;
  }

  const min = flight[0] + hotel[0] * condition.nights + daily[0] * condition.durationDays;
  const max = flight[1] + hotel[1] * condition.nights + daily[1] * condition.durationDays;

  return [min, max];
};

const normalizeBudget = (condition: UserTripCondition): number => {
  // MVP에서는 total/per_person 변환을 UI 입력 단계에서 처리한다.
  // 동행자 수를 받기 전까지는 예산 금액을 그대로 사용한다.
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

  if (budget >= estimatedMax) return 100;
  if (budget >= estimatedMin) return 75;

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

  const scores = selectedTags.map((tag: StyleTag) => destination.styleScores[tag] ?? 0);
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
  if (flightTimeHours <= toleranceHours + 1.5) return 75;
  if (flightTimeHours <= toleranceHours + 3) return 45;
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
    penalty += 5;
  }

  if (destination.seasons.cautionMonths.includes(condition.travelMonth)) {
    penalty += 10;
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
    breakdown.feasibility * 0.25 +
    breakdown.seasonAndWeatherFit * 0.2 +
    breakdown.durationFit * 0.15 +
    breakdown.styleFit * 0.2 +
    breakdown.companionFit * 0.1 +
    breakdown.flightTimeFit * 0.1 -
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
  if (minutes === 0) return `${wholeHours}시간`;
  return `${wholeHours}시간 ${minutes}분`;
};

const buildReasons = (
  destination: Destination,
  condition: UserTripCondition,
  breakdown: DestinationScoreBreakdown,
): string[] => {
  const reasons: string[] = [];
  const flightTimeHours = getFlightTimeHoursForOrigin(destination, condition.departureCity);

  if (breakdown.feasibility >= 75) {
    reasons.push("예산 범위 안에 들어올 가능성이 높습니다.");
  }

  if (breakdown.durationFit >= 80) {
    reasons.push(`${condition.nights}박 일정과 잘 맞습니다.`);
  }

  if (breakdown.styleFit >= 75) {
    reasons.push("선호하는 여행 스타일과 잘 맞습니다.");
  }

  if (breakdown.companionFit >= 75) {
    reasons.push("동행자 유형에 적합합니다.");
  }

  if (breakdown.flightTimeFit >= 80 && flightTimeHours !== null) {
    reasons.push(`비행시간이 약 ${formatFlightTime(flightTimeHours)}로 허용 범위와 맞습니다.`);
  }

  if (destination.seasons.bestMonths.includes(condition.travelMonth)) {
    reasons.push("여행 월이 추천 시즌에 해당합니다.");
  }

  if (reasons.length === 0) {
    reasons.push(destination.shortIntroKo);
  }

  return reasons;
};

const buildCautions = (
  destination: Destination,
  condition: UserTripCondition,
  breakdown: DestinationScoreBreakdown,
): string[] => {
  const cautions: string[] = [];
  const flightTimeHours = getFlightTimeHoursForOrigin(destination, condition.departureCity);

  if (breakdown.feasibility < 75) {
    cautions.push("항공권이나 숙소 가격에 따라 예산을 초과할 수 있습니다.");
  }

  if (breakdown.durationFit < 60) {
    cautions.push("현재 여행 기간과는 다소 맞지 않을 수 있습니다.");
  }

  if (condition.flightTimeToleranceHours !== null && breakdown.flightTimeFit < 75) {
    const detail = flightTimeHours !== null ? ` 예상 비행시간은 약 ${formatFlightTime(flightTimeHours)}입니다.` : "";
    cautions.push(`허용 비행시간보다 길 수 있습니다.${detail}`);
  }

  if (destination.seasons.cautionMonths.includes(condition.travelMonth)) {
    cautions.push("해당 월은 날씨나 성수기 리스크가 있을 수 있습니다.");
  }

  if (destination.dataQuality.needsReview) {
    cautions.push("일부 데이터는 추가 검토가 필요합니다.");
  }

  return cautions;
};

export const scoreDestination = (
  destination: Destination,
  condition: UserTripCondition,
): ScoredDestination => {
  const breakdown = calculateScoreBreakdown(destination, condition);
  const score = calculateFinalScore(breakdown);

  return {
    destination,
    score,
    starRating: toStarRating(score),
    bucket: toBucket(score),
    reasons: buildReasons(destination, condition, breakdown),
    cautions: buildCautions(destination, condition, breakdown),
    estimatedCostRange: estimateTotalCostRange(destination, condition),
    breakdown,
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
