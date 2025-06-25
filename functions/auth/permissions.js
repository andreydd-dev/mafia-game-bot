// auth/permissions.js

/**
 * Checks if a given username is an admin.
 * Admins can be listed in the BOT_ADMINS env variable (comma-separated).
 *
 * @param {string} username
 * @returns {boolean}
 */
function isAdmin(username) {
  const admins = process.env.BOT_ADMINS
    ? process.env.BOT_ADMINS.split(",").map((s) => s.trim())
    : [];

  return admins.includes(username);
}
function isSirko(telegramId) {

  return telegramId === 391881193;
}

module.exports = {
  isAdmin, isSirko
};