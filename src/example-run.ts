import { sampleDestinations } from "./sample-destinations";
import { scoreDestinations } from "./scoring";
import type { UserTripCondition } from "./types";

const condition: UserTripCondition = {
  departureCity: "ICN",
  travelMonth: 7,
  durationDays: 4,
  nights: 3,
  budgetAmount: 800000,
  budgetCurrency: "KRW",
  budgetUnit: "per_person",
  companionType: "friends",
  flightTimeToleranceHours: 6,
  styleTags: ["food", "shopping", "relaxed"],
  mustHaveConditions: ["맛집"],
  avoidConditions: ["장거리", "비싼물가"],
};

const results = scoreDestinations(sampleDestinations, condition);

console.log(
  results.map((result) => ({
    city: result.destination.cityName,
    score: result.score,
    starRating: result.starRating,
    bucket: result.bucket,
    estimatedCostRange: result.estimatedCostRange,
    reasons: result.reasons,
    cautions: result.cautions,
  })),
);
