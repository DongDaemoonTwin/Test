import { describe, expect, it } from "vitest";

import { sampleDestinations } from "./sample-destinations";
import {
  calculateFlightTimeFit,
  estimateTotalCostRange,
  getFlightCostRangeForOrigin,
  scoreDestination,
  scoreDestinations,
} from "./scoring";
import type { Destination, UserTripCondition } from "./types";

const baseCondition: UserTripCondition = {
  departureCity: "ICN",
  travelMonth: 4,
  durationDays: 4,
  nights: 3,
  budgetAmount: 800000,
  budgetCurrency: "KRW",
  budgetUnit: "per_person",
  companionType: "friends",
  flightTimeToleranceHours: 6,
  styleTags: ["food", "shopping"],
  mustHaveConditions: [],
  avoidConditions: [],
};

const getSampleDestination = (cityId: string) => {
  const destination = sampleDestinations.find((item) => item.cityId === cityId);
  if (!destination) throw new Error(`Missing sample destination: ${cityId}`);
  return destination;
};

describe("scoring", () => {
  it("uses the selected departure airport for total cost", () => {
    const fukuoka = getSampleDestination("fukuoka_japan");

    const icnCost = estimateTotalCostRange(fukuoka, { ...baseCondition, departureCity: "ICN" });
    const nrtCost = estimateTotalCostRange(fukuoka, { ...baseCondition, departureCity: "NRT" });

    if (!icnCost || !nrtCost) throw new Error("Expected sample costs to be available.");

    expect(getFlightCostRangeForOrigin(fukuoka.costProfile, "NRT")).toEqual([180000, 350000]);
    expect(icnCost).not.toEqual(nrtCost);
    expect(nrtCost[0]).toBeLessThan(icnCost[0]);
  });

  it("converts mixed route and stay currencies into the user's budget currency", () => {
    const fukuoka = getSampleDestination("fukuoka_japan");
    const destination: Destination = {
      ...fukuoka,
      costProfile: {
        flightCostRangeByOrigin: {
          NRT: [20000, 30000],
        },
        flightCostCurrencyByOrigin: {
          NRT: "JPY",
        },
        hotelPerNightRange: [100, 150],
        hotelPerNightCurrency: "USD",
        dailyLocalCostRange: [50, 70],
        dailyLocalCostCurrency: "USD",
        currency: "KRW",
      },
    };

    const cost = estimateTotalCostRange(destination, {
      ...baseCondition,
      departureCity: "NRT",
      durationDays: 3,
      nights: 2,
      budgetCurrency: "KRW",
    });

    expect(cost).toEqual([670000, 984000]);
  });

  it("reflects flight time tolerance in the score breakdown", () => {
    const paris = getSampleDestination("paris_france");
    const condition = { ...baseCondition, flightTimeToleranceHours: 6 };
    const scored = scoreDestination(paris, condition);

    expect(calculateFlightTimeFit(paris, condition)).toBe(20);
    expect(scored.breakdown.flightTimeFit).toBe(20);
    expect(scored.cautions.some((caution) => caution.includes("비행시간"))).toBe(true);
  });

  it("returns scored destinations in descending order", () => {
    const results = scoreDestinations(sampleDestinations, baseCondition);

    expect(results.length).toBe(sampleDestinations.length);
    for (let index = 1; index < results.length; index += 1) {
      expect(results[index - 1].score).toBeGreaterThanOrEqual(results[index].score);
    }
  });
});
