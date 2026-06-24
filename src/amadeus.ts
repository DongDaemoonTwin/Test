import type { BudgetCurrency, CostProfile, CostRange, Destination } from "./types";

declare const process: {
  env: Record<string, string | undefined>;
};

const DEFAULT_AMADEUS_BASE_URL = "https://test.api.amadeus.com";
const DEFAULT_MAX_FLIGHT_OFFERS = 20;
const DEFAULT_MAX_HOTELS = 20;

export type AmadeusConfig = {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
};

export type AmadeusPriceSearchInput = {
  originLocationCode: string;
  destinationLocationCode: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  currencyCode?: BudgetCurrency;
};

export type AmadeusHotelPriceSearchInput = {
  cityCode: string;
  checkInDate: string;
  checkOutDate: string;
  adults: number;
  roomQuantity?: number;
  currencyCode?: BudgetCurrency;
  radiusKm?: number;
  ratings?: number[];
};

export type PriceSummary = {
  min: number;
  max: number;
  average: number;
  median: number;
  currency: string;
  sampleSize: number;
  source: "amadeus";
  fetchedAt: string;
};

export type DestinationLiveCostProfileInput = {
  destination: Destination;
  originLocationCode?: string;
  destinationLocationCode?: string;
  hotelCityCode?: string;
  departureDate: string;
  returnDate: string;
  adults: number;
  roomQuantity?: number;
  currencyCode?: BudgetCurrency;
  dailyLocalCostRange?: CostRange;
};

class AmadeusError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AmadeusError";
  }
}

const assertConfig = (config: AmadeusConfig): void => {
  if (!config.clientId || !config.clientSecret) {
    throw new Error(
      "Missing Amadeus credentials. Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET.",
    );
  }
};

const getBaseUrl = (config: AmadeusConfig): string => {
  return (config.baseUrl ?? DEFAULT_AMADEUS_BASE_URL).replace(/\/$/, "");
};

const readEnvConfig = (): AmadeusConfig => {
  return {
    clientId: process.env.AMADEUS_CLIENT_ID ?? "",
    clientSecret: process.env.AMADEUS_CLIENT_SECRET ?? "",
    baseUrl: process.env.AMADEUS_BASE_URL ?? DEFAULT_AMADEUS_BASE_URL,
  };
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const average = (values: number[]): number => {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
};

const summarizePrices = (
  prices: number[],
  currency: string,
  fetchedAt = new Date().toISOString(),
): PriceSummary | null => {
  if (prices.length === 0) return null;

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    average: Math.round(average(prices)),
    median: Math.round(median(prices)),
    currency,
    sampleSize: prices.length,
    source: "amadeus",
    fetchedAt,
  };
};

const countNights = (checkInDate: string, checkOutDate: string): number => {
  const checkIn = new Date(`${checkInDate}T00:00:00Z`);
  const checkOut = new Date(`${checkOutDate}T00:00:00Z`);
  const diffMs = checkOut.getTime() - checkIn.getTime();
  const nights = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(1, nights);
};

const toPerNightRange = (summary: PriceSummary, nights: number): CostRange => {
  return [Math.round(summary.min / nights), Math.round(summary.max / nights)];
};

const parseAmadeusError = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return await response.text();
  }
};

const amadeusGet = async <T>(
  config: AmadeusConfig,
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): Promise<T> => {
  const token = await requestAmadeusAccessToken(config);
  const url = new URL(`${getBaseUrl(config)}${path}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new AmadeusError(
      `Amadeus request failed: ${response.status} ${response.statusText}`,
      response.status,
      await parseAmadeusError(response),
    );
  }

  return response.json() as Promise<T>;
};

export const requestAmadeusAccessToken = async (
  config: AmadeusConfig = readEnvConfig(),
): Promise<string> => {
  assertConfig(config);

  const response = await fetch(`${getBaseUrl(config)}/v1/security/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });

  if (!response.ok) {
    throw new AmadeusError(
      `Failed to request Amadeus access token: ${response.status} ${response.statusText}`,
      response.status,
      await parseAmadeusError(response),
    );
  }

  const payload = (await response.json()) as { access_token?: string };

  if (!payload.access_token) {
    throw new AmadeusError("Amadeus token response did not include access_token.");
  }

  return payload.access_token;
};

type FlightOfferResponse = {
  data?: Array<{
    price?: {
      currency?: string;
      total?: string;
      grandTotal?: string;
    };
  }>;
};

export const fetchFlightPriceSummary = async (
  input: AmadeusPriceSearchInput,
  config: AmadeusConfig = readEnvConfig(),
): Promise<PriceSummary | null> => {
  const response = await amadeusGet<FlightOfferResponse>(config, "/v2/shopping/flight-offers", {
    originLocationCode: input.originLocationCode,
    destinationLocationCode: input.destinationLocationCode,
    departureDate: input.departureDate,
    returnDate: input.returnDate,
    adults: input.adults,
    currencyCode: input.currencyCode,
    max: DEFAULT_MAX_FLIGHT_OFFERS,
  });

  const prices =
    response.data
      ?.map((offer) => toNumber(offer.price?.grandTotal ?? offer.price?.total))
      .filter((price): price is number => price !== null) ?? [];

  const currency = response.data?.find((offer) => offer.price?.currency)?.price?.currency;
  return summarizePrices(prices, currency ?? input.currencyCode ?? "USD");
};

type HotelListResponse = {
  data?: Array<{
    hotelId?: string;
    name?: string;
  }>;
};

type HotelOffersResponse = {
  data?: Array<{
    offers?: Array<{
      price?: {
        currency?: string;
        total?: string;
        base?: string;
      };
    }>;
  }>;
};

export const fetchHotelIdsByCity = async (
  input: Pick<AmadeusHotelPriceSearchInput, "cityCode" | "radiusKm" | "ratings">,
  config: AmadeusConfig = readEnvConfig(),
): Promise<string[]> => {
  const response = await amadeusGet<HotelListResponse>(
    config,
    "/v1/reference-data/locations/hotels/by-city",
    {
      cityCode: input.cityCode,
      radius: input.radiusKm,
      radiusUnit: input.radiusKm ? "KM" : undefined,
      ratings: input.ratings?.join(","),
      hotelSource: "ALL",
    },
  );

  return (
    response.data
      ?.map((hotel) => hotel.hotelId)
      .filter((hotelId): hotelId is string => Boolean(hotelId)) ?? []
  ).slice(0, DEFAULT_MAX_HOTELS);
};

export const fetchHotelPriceSummary = async (
  input: AmadeusHotelPriceSearchInput,
  config: AmadeusConfig = readEnvConfig(),
): Promise<PriceSummary | null> => {
  const hotelIds = await fetchHotelIdsByCity(input, config);

  if (hotelIds.length === 0) {
    return null;
  }

  const response = await amadeusGet<HotelOffersResponse>(config, "/v3/shopping/hotel-offers", {
    hotelIds: hotelIds.join(","),
    adults: input.adults,
    checkInDate: input.checkInDate,
    checkOutDate: input.checkOutDate,
    roomQuantity: input.roomQuantity ?? 1,
    currency: input.currencyCode,
  });

  const offers = response.data?.flatMap((hotel) => hotel.offers ?? []) ?? [];
  const prices = offers
    .map((offer) => toNumber(offer.price?.total ?? offer.price?.base))
    .filter((price): price is number => price !== null);

  const currency = offers.find((offer) => offer.price?.currency)?.price?.currency;
  return summarizePrices(prices, currency ?? input.currencyCode ?? "USD");
};

export const buildLiveCostProfileFromAmadeus = async (
  input: DestinationLiveCostProfileInput,
  config: AmadeusConfig = readEnvConfig(),
): Promise<CostProfile> => {
  const flight = await fetchFlightPriceSummary(
    {
      originLocationCode: input.originLocationCode ?? "ICN",
      destinationLocationCode: input.destinationLocationCode ?? input.destination.mainAirport,
      departureDate: input.departureDate,
      returnDate: input.returnDate,
      adults: input.adults,
      currencyCode: input.currencyCode ?? "KRW",
    },
    config,
  );

  const hotel = await fetchHotelPriceSummary(
    {
      cityCode: input.hotelCityCode ?? input.destination.mainAirport,
      checkInDate: input.departureDate,
      checkOutDate: input.returnDate,
      adults: input.adults,
      roomQuantity: input.roomQuantity ?? 1,
      currencyCode: input.currencyCode ?? "KRW",
      radiusKm: 20,
      ratings: [3, 4, 5],
    },
    config,
  );

  const nights = countNights(input.departureDate, input.returnDate);

  return {
    flightCostRangeFromICN: flight ? [flight.min, flight.max] : undefined,
    hotelPerNightRange: hotel ? toPerNightRange(hotel, nights) : undefined,
    dailyLocalCostRange: input.dailyLocalCostRange,
    currency: input.currencyCode ?? "KRW",
    pricingSource: "amadeus_live",
    lastFetchedAt: new Date().toISOString(),
    sampleSize: {
      flights: flight?.sampleSize,
      hotels: hotel?.sampleSize,
    },
    note:
      "Live Amadeus search summary. Hotel offer totals are normalized to a per-night range before scoring.",
  };
};
