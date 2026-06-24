import { loadDestinationsFromGoogleSheets } from "./google-sheets";
import { scoreDestination } from "./scoring";
import type { UserTripCondition } from "./types";

const condition: UserTripCondition = {
  departureCity: "ICN",
  travelMonth: 9,
  durationDays: 4,
  nights: 3,
  budgetAmount: 800_000,
  budgetCurrency: "KRW",
  budgetUnit: "per_person",
  companionType: "friends",
  flightTimeToleranceHours: 6,
  styleTags: ["food", "shopping", "relaxed"],
  mustHaveConditions: [],
  avoidConditions: ["우기", "장거리"],
};

const destinations = await loadDestinationsFromGoogleSheets();
const scoredDestinations = destinations
  .map((destination) => scoreDestination(destination, condition))
  .sort((a, b) => b.score - a.score);

console.log(`Loaded ${destinations.length} destinations from Google Sheets.`);
console.log("Top 10 sample results:");

for (const item of scoredDestinations.slice(0, 10)) {
  console.log(
    `${item.destination.cityName}, ${item.destination.country} | ${item.bucket} | ${item.starRating}★ | score ${item.score}`,
  );
  console.log(`  reason: ${item.reasons[0]}`);

  if (item.cautions.length > 0) {
    console.log(`  caution: ${item.cautions[0]}`);
  }
}
