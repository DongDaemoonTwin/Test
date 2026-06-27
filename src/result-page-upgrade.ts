import "./platform-results.css";

import { loadDestinationsFromGoogleSheets } from "./google-sheets";
import { bucketDefaultLimit, bucketDescription, bucketTitle, cardLabelsFor, type ResultFilter } from "./result-buckets";
import { sampleDestinations } from "./sample-destinations";
import { getFlightCostRangeForOrigin, getFlightTimeHoursForOrigin, scoreDestinations } from "./scoring";
import type { BucketType, CompanionType, Destination, ScoredDestination, StyleTag, UserTripCondition } from "./types";

const companionLabels: Record<CompanionType, string> = {
  solo: "Solo",
  couple: "Couple",
  friends: "Friends",
  family: "Family",
  parents: "Parents",
};

const bucketLabel: Record<BucketType, string> = {
  good: "Good fit",
  borderline: "Borderline",
  difficult: "Difficult",
};

let destinations: Destination[] = sampleDestinations;
let dataSourceLabel = "Sample fallback data";
let lastCondition: UserTripCondition | null = null;
let lastResults: ScoredDestination[] = [];
let activeFilter: ResultFilter = "all";
let expandedBuckets = new Set<BucketType>();

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatKrw = (value: number): string => `KRW ${Math.round(value).toLocaleString("en-US")}`;
const formatRange = (range: [number, number] | null | undefined): string =>
  range ? `${formatKrw(range[0])} - ${formatKrw(range[1])}` : "Missing";
const stars = (rating: number): string => "★".repeat(rating) + "☆".repeat(5 - rating);

const formatHours = (hours: number | null): string => {
  if (hours === null) return "Missing";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return minutes === 0 ? `${wholeHours}h` : `${wholeHours}h ${minutes}m`;
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
  return reasons.length ? reasons : ["It has upside, but this setup limits the fit."];
};

const cautionsFor = (item: ScoredDestination, condition: UserTripCondition): string[] => {
  const cautions: string[] = [];
  if (item.breakdown.feasibility < 75) cautions.push("Prices may exceed your budget from this departure airport.");
  if (item.breakdown.durationFit < 80) cautions.push("Trip length may not match the recommended stay length.");
  if (item.breakdown.flightTimeFit < 75) cautions.push("Flight time may be longer than your tolerance.");
  if (item.breakdown.styleFit < 60) cautions.push("It may not match your selected travel style strongly.");
  if (item.destination.seasons.cautionMonths.includes(condition.travelMonth)) cautions.push("Weather or peak-season risk may apply.");
  if (item.destination.dataQuality.needsReview) cautions.push("Some data still needs review.");
  return cautions.length ? cautions : ["No major caution in the current data."];
};

const renderCard = (item: ScoredDestination, condition: UserTripCondition): string => {
  const labels = cardLabelsFor(item.bucket);
  const flightRange = getFlightCostRangeForOrigin(item.destination.costProfile, condition.departureCity, condition.budgetCurrency);
  const flightTime = getFlightTimeHoursForOrigin(item.destination, condition.departureCity);
  const image = item.destination.imageUrls?.card || "/city-images/fukuoka.svg";
  const tags = item.destination.keywordsKo.slice(0, 3);
  return `<article class="destination-card ${item.bucket}"><div class="destination-image"><img src="${escapeHtml(image)}" alt="${escapeHtml(item.destination.cityName)}" loading="lazy" /><span>${bucketLabel[item.bucket]}</span></div><div class="destination-content"><p class="decision-label">${escapeHtml(labels.primary)}</p><div class="card-head"><div><h3>${escapeHtml(item.destination.cityName)}</h3><p>${escapeHtml(item.destination.country)} · ${escapeHtml(item.destination.mainAirport)}</p></div><div class="score"><strong>${item.score}</strong><small>${stars(item.starRating)}</small></div></div><div class="tag-row">${tags.map((tag) => `<em>${escapeHtml(tag)}</em>`).join("")}</div><div class="price-row"><span>Estimated total</span><strong>${formatRange(item.estimatedCostRange)}</strong><small>Flight ${formatRange(flightRange)} · ${formatHours(flightTime)}</small></div><div class="reason-row"><div><b>${escapeHtml(labels.why)}</b><ul>${reasonsFor(item, condition).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div><div><b>${escapeHtml(labels.watch)}</b><ul>${cautionsFor(item, condition).map((caution) => `<li>${escapeHtml(caution)}</li>`).join("")}</ul></div></div></div></article>`;
};

const renderTab = (filter: ResultFilter, label: string, count: number): string =>
  `<button type="button" class="bucket-tab-button ${activeFilter === filter ? "active" : ""}" data-bucket-filter="${filter}"><span>${label}</span><strong>${count}</strong></button>`;

const renderBucket = (bucket: BucketType, items: ScoredDestination[], condition: UserTripCondition): string => {
  if (activeFilter !== "all" && activeFilter !== bucket) return "";
  const expanded = expandedBuckets.has(bucket) || activeFilter === bucket;
  const visibleItems = items.slice(0, expanded ? items.length : bucketDefaultLimit[bucket]);
  const hidden = items.length - visibleItems.length;
  return `<section class="bucket-section ${bucket}"><div class="bucket-section-head"><div><p class="kicker">${bucketLabel[bucket]}</p><h3>${bucketTitle[bucket]}</h3><p>${bucketDescription[bucket]}</p></div><strong>${items.length}</strong></div>${items.length === 0 ? `<div class="bucket-empty">No destinations in this bucket.</div>` : `<div class="cards bucket-cards">${visibleItems.map((item) => renderCard(item, condition)).join("")}</div>`}${hidden > 0 ? `<button type="button" class="show-more-bucket" data-show-bucket="${bucket}">Show ${hidden} more ${bucketLabel[bucket].toLowerCase()} destinations</button>` : ""}</section>`;
};

const attachHandlers = (): void => {
  document.querySelectorAll<HTMLButtonElement>(".bucket-tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      if (!lastCondition) return;
      activeFilter = (button.dataset.bucketFilter ?? "all") as ResultFilter;
      renderGroupedResults(lastCondition, true);
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".show-more-bucket").forEach((button) => {
    button.addEventListener("click", () => {
      if (!lastCondition) return;
      const bucket = button.dataset.showBucket as BucketType | undefined;
      if (!bucket) return;
      expandedBuckets.add(bucket);
      renderGroupedResults(lastCondition, true);
    });
  });
};

const renderGroupedResults = (condition: UserTripCondition, keepExisting = false): void => {
  lastCondition = condition;
  if (!keepExisting) {
    lastResults = scoreDestinations(destinations, condition);
    activeFilter = "all";
    expandedBuckets = new Set();
  }
  const results = document.querySelector<HTMLElement>("#results");
  if (!results) return;
  const good = lastResults.filter((item) => item.bucket === "good");
  const borderline = lastResults.filter((item) => item.bucket === "borderline");
  const difficult = lastResults.filter((item) => item.bucket === "difficult");
  results.className = "results";
  results.innerHTML = `<div class="results-head"><div><p class="kicker">Destination decision result</p><h2>Good, borderline, and difficult options.</h2><p>${escapeHtml(condition.departureCity)} · Month ${condition.travelMonth} · ${condition.nights} nights · ${formatKrw(condition.budgetAmount)} · ${escapeHtml(dataSourceLabel)}</p></div></div><div class="result-summary-grid"><div class="summary-card good"><span>Good fit</span><strong>${good.length}</strong><p>Start here</p></div><div class="summary-card borderline"><span>Borderline</span><strong>${borderline.length}</strong><p>Possible with trade-offs</p></div><div class="summary-card difficult"><span>Difficult</span><strong>${difficult.length}</strong><p>Not ideal now</p></div></div><div class="bucket-tabs">${renderTab("all", "All", lastResults.length)}${renderTab("good", "Good", good.length)}${renderTab("borderline", "Borderline", borderline.length)}${renderTab("difficult", "Difficult", difficult.length)}</div><div class="bucket-sections">${renderBucket("good", good, condition)}${renderBucket("borderline", borderline, condition)}${renderBucket("difficult", difficult, condition)}</div>`;
  attachHandlers();
};

const bootUpgrade = async (): Promise<void> => {
  try {
    const loaded = await loadDestinationsFromGoogleSheets({ accessMode: "public" });
    if (loaded.length > 0) {
      destinations = loaded;
      dataSourceLabel = "Google Sheets";
    }
  } catch (error) {
    console.warn("Grouped result upgrade could not load Google Sheets. Using fallback data.", error);
  }

  const form = document.querySelector<HTMLFormElement>("#trip-form");
  if (!form) {
    window.setTimeout(() => void bootUpgrade(), 200);
    return;
  }
  form.addEventListener("submit", () => window.setTimeout(() => renderGroupedResults(conditionFromForm(form)), 0));
};

void bootUpgrade();
