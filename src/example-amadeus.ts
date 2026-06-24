import { buildLiveCostProfileFromAmadeus } from "./amadeus";
import { loadDestinationsFromGoogleSheets } from "./google-sheets";

declare const process: {
  env: Record<string, string | undefined>;
};

const destinationCityId = process.env.DESTINATION_CITY_ID ?? "fukuoka_japan";
const originLocationCode = process.env.ORIGIN_LOCATION_CODE ?? "ICN";
const destinationLocationCode = process.env.DESTINATION_LOCATION_CODE;
const hotelCityCode = process.env.HOTEL_CITY_CODE;
const departureDate = process.env.DEPARTURE_DATE ?? "2026-09-15";
const returnDate = process.env.RETURN_DATE ?? "2026-09-18";
const adults = Number(process.env.ADULTS ?? 1);
const roomQuantity = Number(process.env.ROOM_QUANTITY ?? 1);

const main = async (): Promise<void> => {
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
