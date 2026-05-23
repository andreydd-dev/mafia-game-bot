/** Усі календарні операції — у UTC (+0). */

function getCurrentDateUtc() {
  return new Date().toISOString().split("T")[0];
}

function normalizeGameDateString(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const isoPart = dateStr.trim().split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoPart)) return null;
  return isoPart;
}

function getGameDateFromProperties(properties) {
  const gameDateProp = properties?.["Game date"];
  if (!gameDateProp) return null;

  const fromRichText = normalizeGameDateString(
    gameDateProp.rich_text?.[0]?.text?.content,
  );
  if (fromRichText) return fromRichText;

  return normalizeGameDateString(gameDateProp.date?.start);
}

function parseGameDateUtc(dateStr) {
  const normalized = normalizeGameDateString(dateStr);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

function isTodayOrFutureGameDate(dateStr) {
  const gameDate = parseGameDateUtc(dateStr);
  const today = parseGameDateUtc(getCurrentDateUtc());
  if (gameDate === null || today === null) return false;
  return gameDate >= today;
}

function formatGameDateUkUa(dateStr) {
  const normalized = normalizeGameDateString(dateStr);
  if (!normalized) return dateStr;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

module.exports = {
  getCurrentDateUtc,
  normalizeGameDateString,
  getGameDateFromProperties,
  parseGameDateUtc,
  isTodayOrFutureGameDate,
  formatGameDateUkUa,
};
