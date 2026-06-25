import "./platform-styles.css";

import { loadDestinationsFromGoogleSheets } from "./google-sheets";
import { sampleDestinations } from "./sample-destinations";
import {
  getFlightCostRangeForOrigin,
  getFlightTimeHoursForOrigin,
  scoreDestination,
  scoreDestinations,
} from "./scoring";
import type { CompanionType, Destination, ScoredDestination, StyleTag, UserTripCondition } from "./types";

const cityMeta: Record<string, { name: string; country: string; image: string; alt: string; tags: string[] }> = {
  fukuoka_japan: {
    name: "Fukuoka",
    country: "Japan",
    image: "/city-images/fukuoka.svg",
    alt: "Fukuoka city image",
    tags: ["Short flight", "Food", "City break"],
  },
  danang_vietnam: {
    name: "Da Nang",
    country: "Vietnam",
    image: "/city-images/danang.svg",
    alt: "Da Nang beach image",
    tags: ["Beach", "Resort", "Value"],
  },
  paris_france: {
    name: "Paris",
    country: "France",
    image: "/city-images/paris.svg",
    alt: "Paris city image",
    tags: ["Culture", "Shopping", "Long haul"],
  },
};

const styleOptions: Array<{ value: StyleTag; label: string }> = [
  { value: "budget", label: "Budget" },
  { value: "food", label: "Food" },
  { value: "shopping", label: "Shopping" },
  { value: "nature", label: "Nature" },
  { value: "culture", label: "Culture" },
  { value: "activity", label: "Activities" },
  { value: "relaxed", label: "Relax" },
  { value: "photo", label: "Photo" },
  { value: "localExperience", label: "Local" },
];

const companionLabels: Record<CompanionType, string> = {
  solo: "Solo",
  couple: "Couple",
  friends: "Friends",
  family: "Family",
  parents: "Parents",
};

const bucketLabel: Record<ScoredDestination["bucket"], string> = {
  good: "Good fit",
  borderline: "Borderline",
  difficult: "Difficult",
};

let destinations: Destination[] = sampleDestinations;
let dataSourceLabel = "Sample fallback data";
let lastCondition: UserTripCondition | null = null;
let lastResults: ScoredDestination[] = [];
let selectedCompareIds = new Set<string>();

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatKrw = (value: number): string => `KRW ${Math.round(value).toLocaleString("en-US")}`;
const stars = (rating: number): string => "★".repeat(rating) + "☆".repeat(5 - rating);

const formatRange = (range: [number, number] | null | undefined): string => {
  if (!range) return "Missing";
  return `${formatKrw(range[0])} - ${formatKrw(range[1])}`;
};

const formatHours = (hours: number | null): string => {
  if (hours === null) return "Missing";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
};

const splitList = (value: FormDataEntryValue | null): string[] =>
  String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const conditionFromForm = (form: HTMLFormElement): UserTripCondition => {
  const data = new FormData(form);
  const flightTime = String(data.get("flightTimeToleranceHours") ?? "");

  return {
    departureCity: String(data.get("departureCity")),
    travelMonth: Number(data.get("travelMonth")),
    durationDays: Number(data.get("durationDays")),
    nights: Number(data.get("nights")),
    budgetAmount: Number(data.get("budgetAmount")),
    budgetCurrency: "KRW",
    budgetUnit: "per_person",
    companionType: String(data.get("companionType")) as CompanionType,
    flightTimeToleranceHours: flightTime === "any" ? null : Number(flightTime),
    styleTags: data.getAll("styleTags").map(String) as StyleTag[],
    mustHaveConditions: splitList(data.get("mustHaveConditions")),
    avoidConditions: splitList(data.get("avoidConditions")),
  };
};

const reasonsFor = (item: ScoredDestination, condition: UserTripCondition): string[] => {
  const reasons: string[] = [];
  if (item.breakdown.feasibility >= 75) reasons.push("Likely to fit your budget from the selected departure airport.");
  if (item.breakdown.durationFit >= 80) reasons.push(`Works for ${condition.nights} nights.`);
  if (item.breakdown.styleFit >= 75) reasons.push("Matches your selected style.");
  if (item.breakdown.companionFit >= 75) reasons.push(`Good for ${companionLabels[condition.companionType].toLowerCase()} travel.`);
  if (item.breakdown.flightTimeFit >= 80) reasons.push("Flight time fits your tolerance.");
  return reasons.length ? reasons : ["A reasonable destination candidate for this setup."];
};

const cautionsFor = (item: ScoredDestination, condition: UserTripCondition): string[] => {
  const cautions: string[] = [];
  if (item.breakdown.feasibility < 75) cautions.push("Prices may exceed your budget from this departure airport.");
  if (item.breakdown.flightTimeFit < 75) cautions.push("Flight time may be longer than your tolerance.");
  if (item.destination.seasons.cautionMonths.includes(condition.travelMonth)) cautions.push("Weather or peak-season risk may apply.");
  if (item.destination.dataQuality.needsReview) cautions.push("Some data still needs review.");
  return cautions.length ? cautions : ["No major caution in the current data."];
};

const metaFor = (destination: Destination): { name: string; country: string; image: string; alt: string; tags: string[] } => {
  const knownMeta = cityMeta[destination.cityId];
  if (knownMeta) return knownMeta;

  return {
    name: destination.cityName,
    country: destination.country,
    image: destination.imageUrls?.card || "/city-images/fukuoka.svg",
    alt: destination.imageUrls?.alt || "Destination image",
    tags: destination.keywordsKo.slice(0, 3),
  };
};

const renderCard = (item: ScoredDestination, condition: UserTripCondition): string => {
  const meta = metaFor(item.destination);
  const cost = item.estimatedCostRange ? formatRange(item.estimatedCostRange) : "Cost data missing for selected departure";
  const flightRange = getFlightCostRangeForOrigin(item.destination.costProfile, condition.departureCity);
  const flightTime = getFlightTimeHoursForOrigin(item.destination, condition.departureCity);
  const selected = selectedCompareIds.has(item.destination.cityId);

  return `
    <article class="destination-card ${item.bucket} ${selected ? "selected" : ""}">
      <div class="destination-image"><img src="${escapeHtml(meta.image)}" alt="${escapeHtml(meta.alt)}" loading="lazy" /><span>${bucketLabel[item.bucket]}</span></div>
      <div class="destination-content">
        <div class="card-head"><div><h3>${escapeHtml(meta.name)}</h3><p>${escapeHtml(meta.country)} · ${escapeHtml(item.destination.mainAirport)}</p></div><div class="score"><strong>${item.score}</strong><small>${stars(item.starRating)}</small></div></div>
        <div class="tag-row">${meta.tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</div>
        <div class="price-row"><span>Estimated total</span><strong>${cost}</strong><small>Flight ${formatRange(flightRange)} · ${formatHours(flightTime)}</small></div>
        <div class="reason-row"><div><b>Why</b><ul>${reasonsFor(item, condition).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div><div><b>Watch</b><ul>${cautionsFor(item, condition).map((caution) => `<li>${escapeHtml(caution)}</li>`).join("")}</ul></div></div>
        <button type="button" class="compare-button" data-city-id="${escapeHtml(item.destination.cityId)}">${selected ? "Selected for compare" : "Add to compare"}</button>
      </div>
    </article>
  `;
};

const attachCompareCardHandlers = (): void => {
  document.querySelectorAll<HTMLButtonElement>(".compare-button").forEach((button) => {
    button.addEventListener("click", () => {
      const cityId = button.dataset.cityId;
      if (!cityId || !lastCondition) return;

      const nextSelectedIds = new Set(selectedCompareIds);
      if (nextSelectedIds.has(cityId)) {
        nextSelectedIds.delete(cityId);
      } else if (nextSelectedIds.size < 5) {
        nextSelectedIds.add(cityId);
      }

      selectedCompareIds = nextSelectedIds;
      renderResults(lastCondition);
    });
  });
};

const selectedCompareItems = (): ScoredDestination[] => {
  return [...selectedCompareIds]
    .map((cityId) => lastResults.find((item) => item.destination.cityId === cityId))
    .filter((item): item is ScoredDestination => Boolean(item));
};

const renderComparePanel = (): void => {
  const panel = document.querySelector<HTMLElement>("#compare-panel");
  if (!panel) return;

  const selectedItems = selectedCompareItems();

  if (selectedItems.length === 0) {
    panel.innerHTML = `
      <div class="compare-empty">
        <p class="kicker">Compare</p>
        <h2>Select 2–5 destinations to compare.</h2>
        <p>Use the buttons on destination cards to compare budget, flight time, style fit, and trade-offs.</p>
      </div>
    `;
    return;
  }

  const topPick = [...selectedItems].sort((a, b) => b.score - a.score)[0];
  const tableRows = selectedItems
    .map((item) => {
      const meta = metaFor(item.destination);
      const flightTime = getFlightTimeHoursForOrigin(item.destination, lastCondition?.departureCity ?? "ICN");

      return `
        <tr>
          <td><strong>${escapeHtml(meta.name)}</strong><small>${escapeHtml(meta.country)}</small></td>
          <td>${bucketLabel[item.bucket]}</td>
          <td>${formatRange(item.estimatedCostRange)}</td>
          <td>${formatHours(flightTime)}</td>
          <td>${item.breakdown.styleFit}</td>
          <td>${item.breakdown.flightTimeFit}</td>
          <td>${item.cautions.length ? escapeHtml(item.cautions[0]) : "None"}</td>
          <td><button type="button" class="remove-compare" data-remove-city-id="${escapeHtml(item.destination.cityId)}">Remove</button></td>
        </tr>
      `;
    })
    .join("");

  panel.innerHTML = `
    <div class="compare-head">
      <div>
        <p class="kicker">Compare</p>
        <h2>${selectedItems.length < 2 ? "Select one more destination" : "Destination comparison"}</h2>
        <p>${selectedItems.length}/5 selected · Best current pick: <strong>${escapeHtml(metaFor(topPick.destination).name)}</strong></p>
      </div>
      <button type="button" id="clear-compare">Clear</button>
    </div>
    ${
      selectedItems.length < 2
        ? `<div class="compare-empty"><p>Add at least 2 destinations to open the comparison table.</p></div>`
        : `<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th>Destination</th><th>Fit</th><th>Estimated total</th><th>Flight</th><th>Style</th><th>Flight fit</th><th>Main caution</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div>`
    }
  `;

  document.querySelector<HTMLButtonElement>("#clear-compare")?.addEventListener("click", () => {
    if (!lastCondition) return;
    selectedCompareIds = new Set();
    renderResults(lastCondition);
  });

  panel.querySelectorAll<HTMLButtonElement>(".remove-compare").forEach((button) => {
    button.addEventListener("click", () => {
      if (!lastCondition) return;
      const cityId = button.dataset.removeCityId;
      if (!cityId) return;
      const nextSelectedIds = new Set(selectedCompareIds);
      nextSelectedIds.delete(cityId);
      selectedCompareIds = nextSelectedIds;
      renderResults(lastCondition);
    });
  });
};

const renderResults = (condition: UserTripCondition): void => {
  lastCondition = condition;
  lastResults = scoreDestinations(destinations, condition);
  const target = document.querySelector<HTMLElement>("#results");
  if (!target) return;

  target.className = "results";
  target.innerHTML = `
    <div class="results-head"><div><p class="kicker">Destination results</p><h2>Your best options</h2><p>${escapeHtml(condition.departureCity)} · Month ${condition.travelMonth} · ${condition.nights} nights · ${formatKrw(condition.budgetAmount)} · ${escapeHtml(dataSourceLabel)}</p></div></div>
    <div class="bucket-tabs"><span>Good ${lastResults.filter((item) => item.bucket === "good").length}</span><span>Borderline ${lastResults.filter((item) => item.bucket === "borderline").length}</span><span>Difficult ${lastResults.filter((item) => item.bucket === "difficult").length}</span></div>
    <div class="cards">${lastResults.slice(0, 24).map((item) => renderCard(item, condition)).join("")}</div>
  `;

  attachCompareCardHandlers();
  renderComparePanel();
};

const renderShell = (): void => {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  app.innerHTML = `
    <main>
      <nav class="nav"><strong>Traveling Idea</strong><span>Search</span><span>Compare</span><span>Trips</span></nav>
      <section class="hero">
        <div><p class="kicker">Destination decision platform</p><h1>Find where to go before you book.</h1><p class="lead">Compare destinations by budget, travel month, duration, companions, style, and flight time.</p></div>
        <div class="hero-panel"><strong>Travel smarter</strong><p>Start from your real constraints, then compare destination trade-offs before booking.</p><small id="data-source">Loading destination data…</small></div>
      </section>
      <section class="search-panel" id="planner">
        <form id="trip-form" class="search-form">
          <label><span>From</span><select name="departureCity" required><option value="" selected disabled>Select airport</option><option value="ICN">Seoul Incheon</option><option value="GMP">Seoul Gimpo</option><option value="NRT">Tokyo Narita</option><option value="KIX">Osaka Kansai</option></select></label>
          <label><span>Month</span><select name="travelMonth" required><option value="" selected disabled>Select month</option>${Array.from({ length: 12 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("")}</select></label>
          <label><span>Days</span><input name="durationDays" type="number" min="1" placeholder="4" required /></label>
          <label><span>Nights</span><input name="nights" type="number" min="0" placeholder="3" required /></label>
          <label><span>Budget</span><input name="budgetAmount" type="number" min="0" placeholder="800000" required /></label>
          <label><span>Companion</span><select name="companionType" required><option value="" selected disabled>Select type</option>${Object.entries(companionLabels).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <label><span>Flight time</span><select name="flightTimeToleranceHours" required><option value="" selected disabled>Select tolerance</option><option value="3">Up to 3h</option><option value="6">Up to 6h</option><option value="10">Up to 10h</option><option value="any">Any</option></select></label>
          <fieldset>${styleOptions.map((option) => `<label><input type="checkbox" name="styleTags" value="${option.value}" /><span>${option.label}</span></label>`).join("")}</fieldset>
          <input name="mustHaveConditions" placeholder="Must-have: beach, shopping, short flight" />
          <input name="avoidConditions" placeholder="Avoid: rainy season, long flights" />
          <button type="submit">Search destinations</button>
        </form>
      </section>
      <section id="results" class="empty"><p class="kicker">No search yet</p><h2>Destination cards will appear here.</h2><p>Submit your trip conditions to see recommendation reasons and route-aware estimates.</p></section>
      <section id="compare-panel" class="compare-panel"></section>
    </main>
  `;
};

const setDataSourceLabel = (): void => {
  const target = document.querySelector<HTMLElement>("#data-source");
  if (!target) return;
  target.textContent = `Data source: ${dataSourceLabel} · ${destinations.length} destinations`;
};

const loadPreviewDestinations = async (): Promise<void> => {
  try {
    const loadedDestinations = await loadDestinationsFromGoogleSheets({ accessMode: "public" });
    if (loadedDestinations.length > 0) {
      destinations = loadedDestinations;
      dataSourceLabel = "Google Sheets";
      return;
    }
  } catch (error) {
    console.warn("Google Sheets preview load failed. Falling back to sample data.", error);
  }

  destinations = sampleDestinations;
  dataSourceLabel = "Sample fallback data";
};

const boot = async (): Promise<void> => {
  renderShell();
  renderComparePanel();

  await loadPreviewDestinations();
  setDataSourceLabel();

  const form = document.querySelector<HTMLFormElement>("#trip-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    selectedCompareIds = new Set();
    renderResults(conditionFromForm(form));
  });
};

void boot();
