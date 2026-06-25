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

const formatRange = (range: [number, number] | null | undefined): string => {
  if (!range) return "missing";
  return `${Math.round(range[0]).toLocaleString("ko-KR")}~${Math.round(range[1]).toLocaleString("ko-KR")} KRW`;
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
  console.log(`  estimated total: ${formatRange(item.estimatedCostRange)}`);
  console.log(`  flight range: ${formatRange(item.destination.costProfile.flightCostRangeFromICN)}`);
  console.log(`  hotel/night: ${formatRange(item.destination.costProfile.hotelPerNightRange)}`);
  console.log(`  daily local: ${formatRange(item.destination.costProfile.dailyLocalCostRange)}`);
  console.log(
    `  style food/shopping/relaxed: ${item.destination.styleScores.food}/${item.destination.styleScores.shopping}/${item.destination.styleScores.relaxed}`,
  );
  console.log(`  companion friends: ${item.destination.companionScores.friends}`);
  console.log(`  reason: ${item.reasons[0]}`);

  if (item.cautions.length > 0) {
    console.log(`  caution: ${item.cautions[0]}`);
  }
}
