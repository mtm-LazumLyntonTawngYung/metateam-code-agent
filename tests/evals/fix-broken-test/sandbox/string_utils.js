/**
 * Capitalize the first letter of each word in a string.
 * Words are separated by spaces.
 */
function capitalize(str) {
  if (typeof str !== "string" || str.length === 0) return "";
  const words = str.split(" ");
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.length > 0) {
      words[i] = w[0].toUpperCase() + w.slice(2);  // BUG: should be slice(1)
    }
  }
  return words.join(" ");
}

module.exports = { capitalize };
