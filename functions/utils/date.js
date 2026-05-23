/** Усі календарні операції — у UTC (+0). */

function getCurrentDateUtc() {
  return new Date().toISOString().split("T")[0];
}

function parseGameDateUtc(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const [year, month, day] = dateStr.split("-").map(Number);
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
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
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
  parseGameDateUtc,
  isTodayOrFutureGameDate,
  formatGameDateUkUa,
};
