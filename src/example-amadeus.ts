import { buildLiveCostProfileFromAmadeus } from "./amadeus";
import { loadDestinationsFromGoogleSheets } from "./google-sheets";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const destinationCityId = process.env.DESTINATION_CITY_ID ?? "fukuoka_japan";
const originLocationCode = process.env.ORIGIN_LOCATION_CODE ?? "ICN";
const destinationLocationCode = process.env.DESTINATION_LOCATION_CODE;
const hotelCityCode = process.env.HOTEL_CITY_CODE;
const departureDate = process.env.DEPARTURE_DATE ?? "2026-09-15";
const returnDate = process.env.RETURN_DATE ?? "2026-09-18";
const adults = Number(process.env.ADULTS ?? 1);
const roomQuantity = Number(process.env.ROOM_QUANTITY ?? 1);

const hasAmadeusCredentials = (): boolean =>
  Boolean(process.env.AMADEUS_CLIENT_ID?.trim() && process.env.AMADEUS_CLIENT_SECRET?.trim());

const printMissingCredentialsGuide = (): void => {
  console.log(`
Amadeus credentials are not set yet.

This is not a local web preview error. The web preview runs with:

  npm run dev -- --host 0.0.0.0

To run live Amadeus pricing, set these environment variables first:

  export AMADEUS_CLIENT_ID="your_api_key"
  export AMADEUS_CLIENT_SECRET="your_api_secret"
  export AMADEUS_BASE_URL="https://test.api.amadeus.com"

Then run:

  npm run amadeus:example
`);
};

const main = async (): Promise<void> => {
  if (!hasAmadeusCredentials()) {
    printMissingCredentialsGuide();
    return;
  }

  const destinations = await loadDestinationsFromGoogleSheets();
  const destination = destinations.find((item) => item.cityId === destinationCityId);

  if (!destination) {
    throw new Error(`Destination not found: ${destinationCityId}`);
  }

  const liveCostProfile = await buildLiveCostProfileFromAmadeus({
    destination,
    originLocationCode,
    destinationLocationCode,
    hotelCityCode,
    departureDate,
    returnDate,
    adults,
    roomQuantity,
    currencyCode: "KRW",
    dailyLocalCostRange: destination.costProfile.dailyLocalCostRange,
  });

  console.log(JSON.stringify({ destination: destination.cityName, liveCostProfile }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
