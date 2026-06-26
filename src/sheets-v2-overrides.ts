import { fetchGoogleSheetTab } from "./google-sheets";
import type { CompanionScores, CostRange, Destination, FlightTimeProfile, RouteFlightProfile, StyleScores } from "./types";

type SheetRecord = Record<string, string>;

type V2OverrideOptions = {
  accessMode?: "auto" | "public" | "service_account";
  sheetId?: string;
};

const text = (value: unknown): string => String(value ?? "").trim();
const numberValue = (value: unknown): number | null => {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[₩¥$]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const numberOrFallback = (value: unknown, fallback: number): number => numberValue(value) ?? fallback;
const makeRange = (low: number | null, high: number | null): CostRange | undefined => {
  if (low === null || high === null) return undefined;
  return [low, high];
};

const fetchOptionalTab = async (sheetName: string, options: V2OverrideOptions): Promise<SheetRecord[]> => {
  try {
    return await fetchGoogleSheetTab(sheetName, options);
  } catch (error) {
    console.warn(`Optional V2 tab ${sheetName} could not be loaded.`, error);
    return [];
  }
};

const indexByCityId = (rows: SheetRecord[]): Map<string, SheetRecord> => {
  const indexed = new Map<string, SheetRecord>();
  for (const row of rows) {
    const cityId = text(row.city_id);
    if (cityId) indexed.set(cityId, row);
  }
  return indexed;
};

const groupRoutesByCityId = (rows: SheetRecord[]): Map<string, SheetRecord[]> => {
  const grouped = new Map<string, SheetRecord[]>();
  for (const row of rows) {
    const cityId = text(row.city_id);
    if (!cityId) continue;
    grouped.set(cityId, [...(grouped.get(cityId) ?? []), row]);
  }
  return grouped;
};

const applyCostV2 = (destination: Destination, row: SheetRecord | undefined): Destination => {
  if (!row) return destination;

  const flightRange = makeRange(numberValue(row.flight_low_icn_krw_v2), numberValue(row.flight_high_icn_krw_v2));
  const hotelRange = makeRange(numberValue(row.hotel_budget_usd_v2), numberValue(row.hotel_high_usd_v2));
  const dailyLow = numberValue(row.daily_budget_usd_v2);
  const dailyHigh = numberValue(row.daily_high_usd_v2);
  const localTransport = numberOrFallback(row.local_transport_usd_v2, 0);
  const dailyRange = dailyLow !== null && dailyHigh !== null ? ([dailyLow + localTransport, dailyHigh + localTransport] as CostRange) : undefined;
  const flightCostRangeByOrigin = { ...(destination.costProfile.flightCostRangeByOrigin ?? {}) };
  const flightCostCurrencyByOrigin = { ...(destination.costProfile.flightCostCurrencyByOrigin ?? {}) };

  if (flightRange) {
    flightCostRangeByOrigin.ICN = flightRange;
    flightCostCurrencyByOrigin.ICN = "KRW";
  }

  return {
    ...destination,
    costProfile: {
      ...destination.costProfile,
      flightCostRangeFromICN: flightRange ?? destination.costProfile.flightCostRangeFromICN,
      flightCostRangeByOrigin,
      flightCostCurrencyByOrigin,
      hotelPerNightRange: hotelRange ?? destination.costProfile.hotelPerNightRange,
      hotelPerNightCurrency: hotelRange ? "USD" : destination.costProfile.hotelPerNightCurrency,
      dailyLocalCostRange: dailyRange ?? destination.costProfile.dailyLocalCostRange,
      dailyLocalCostCurrency: dailyRange ? "USD" : destination.costProfile.dailyLocalCostCurrency,
      currency: "KRW",
      note: text(row.cost_note_v2) || destination.costProfile.note,
      pricingSource: "google_sheets_v2_static_estimate",
      lastFetchedAt: "2026-06-26",
    },
  };
};

const applyStyleV2 = (scores: StyleScores, row: SheetRecord | undefined): StyleScores => {
  if (!row) return scores;
  return {
    ...scores,
    budget: numberOrFallback(row.budget, scores.budget),
    food: numberOrFallback(row.food, scores.food),
    shopping: numberOrFallback(row.shopping, scores.shopping),
    nature: numberOrFallback(row.nature, scores.nature),
    culture: numberOrFallback(row.culture, scores.culture),
    activity: numberOrFallback(row.activity, scores.activity),
    relaxed: numberOrFallback(row.relaxed, scores.relaxed),
    photo: numberOrFallback(row.photo, scores.photo),
    localExperience: numberOrFallback(row.local_experience, scores.localExperience),
    nightlife: numberValue(row.nightlife) ?? scores.nightlife,
    familyFriendly: numberValue(row.family_friendly) ?? scores.familyFriendly,
    firstTimer: numberValue(row.first_timer) ?? scores.firstTimer,
  };
};

const applyCompanionV2 = (scores: CompanionScores, row: SheetRecord | undefined): CompanionScores => {
  if (!row) return scores;
  return {
    ...scores,
    solo: numberOrFallback(row.solo, scores.solo),
    couple: numberOrFallback(row.couple, scores.couple),
    friends: numberOrFallback(row.friends, scores.friends),
    family: numberOrFallback(row.family, scores.family),
    parents: numberOrFallback(row.parents, scores.parents),
    children: numberValue(row.children) ?? scores.children,
  };
};

const directStatusToBoolean = (status: string): boolean | undefined => {
  if (status === "likely_current_direct") return true;
  if (status === "transfer_likely") return false;
  return undefined;
};

const applyRoutesV2 = (destination: Destination, rows: SheetRecord[] | undefined): Destination => {
  if (!rows?.length) return destination;

  const flightTimeProfile: FlightTimeProfile = {
    ...(destination.flightTimeProfile ?? {}),
    flightTimeHoursByOrigin: { ...(destination.flightTimeProfile?.flightTimeHoursByOrigin ?? {}) },
    directFlightAvailableByOrigin: { ...(destination.flightTimeProfile?.directFlightAvailableByOrigin ?? {}) },
    transferAirportsByOrigin: { ...(destination.flightTimeProfile?.transferAirportsByOrigin ?? {}) },
    note: "V2 route data uses estimated flight time and direct-flight confidence. Verify live schedules before launch.",
  };
  const routeFlightProfilesByOrigin: Record<string, RouteFlightProfile> = { ...(destination.routeFlightProfilesByOrigin ?? {}) };

  for (const row of rows) {
    const origin = text(row.departure_airport).toUpperCase();
    if (!origin) continue;
    const flightHours = numberValue(row.flight_hours_est);
    const directValue = directStatusToBoolean(text(row.direct_status_v2));
    if (flightHours !== null) flightTimeProfile.flightTimeHoursByOrigin![origin] = flightHours;
    if (origin === "ICN") flightTimeProfile.flightTimeHoursFromICN = flightHours ?? flightTimeProfile.flightTimeHoursFromICN;
    if (origin === "GMP") flightTimeProfile.flightTimeHoursFromGMP = flightHours ?? flightTimeProfile.flightTimeHoursFromGMP;
    if (origin === "NRT") flightTimeProfile.flightTimeHoursFromNRT = flightHours ?? flightTimeProfile.flightTimeHoursFromNRT;
    if (origin === "KIX") flightTimeProfile.flightTimeHoursFromKIX = flightHours ?? flightTimeProfile.flightTimeHoursFromKIX;
    if (directValue !== undefined) flightTimeProfile.directFlightAvailableByOrigin![origin] = directValue;
    routeFlightProfilesByOrigin[origin] = {
      ...(routeFlightProfilesByOrigin[origin] ?? { departureAirport: origin, arrivalAirport: text(row.arrival_airport) }),
      departureAirport: origin,
      arrivalAirport: text(row.arrival_airport),
      flightDurationHours: flightHours ?? routeFlightProfilesByOrigin[origin]?.flightDurationHours,
      isDirectAvailable: directValue ?? routeFlightProfilesByOrigin[origin]?.isDirectAvailable,
      routeConfidence: text(row.direct_confidence_v2) || routeFlightProfilesByOrigin[origin]?.routeConfidence,
      needsReview: text(row.schedule_check_needed) !== "before_launch",
      sourceNote: text(row.direct_reason_note) || text(row.route_source_note),
      lastUpdated: "2026-06-26",
    };
  }

  return { ...destination, flightTimeProfile, routeFlightProfilesByOrigin };
};

export const applyV2SheetOverrides = async (destinations: Destination[], options: V2OverrideOptions = {}): Promise<Destination[]> => {
  const [costRows, styleRows, companionRows, routeRows] = await Promise.all([
    fetchOptionalTab("Cost_Profiles_V2", options),
    fetchOptionalTab("Style_Rescore_V2", options),
    fetchOptionalTab("Companion_Rescore_V2", options),
    fetchOptionalTab("Route_Verification_V2", options),
  ]);

  if (!costRows.length && !styleRows.length && !companionRows.length && !routeRows.length) return destinations;

  const costByCityId = indexByCityId(costRows);
  const styleByCityId = indexByCityId(styleRows);
  const companionByCityId = indexByCityId(companionRows);
  const routesByCityId = groupRoutesByCityId(routeRows);

  return destinations.map((destination) => {
    const withCost = applyCostV2(destination, costByCityId.get(destination.cityId));
    const withScores = {
      ...withCost,
      styleScores: applyStyleV2(withCost.styleScores, styleByCityId.get(destination.cityId)),
      companionScores: applyCompanionV2(withCost.companionScores, companionByCityId.get(destination.cityId)),
    };
    return applyRoutesV2(withScores, routesByCityId.get(destination.cityId));
  });
};
