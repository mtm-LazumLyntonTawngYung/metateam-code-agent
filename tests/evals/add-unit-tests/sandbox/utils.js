function isPalindrome(str) {
  if (typeof str !== "string") return false;
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, "");
  return cleaned === cleaned.split("").reverse().join("");
}

function factorial(n) {
  if (typeof n !== "number" || !Number.isInteger(n)) throw new Error("Integer required");
  if (n < 0) throw new Error("Negative input");
  if (n === 0 || n === 1) return 1;
  return n * factorial(n - 1);
}

function fibonacci(n) {
  if (typeof n !== "number" || !Number.isInteger(n)) throw new Error("Integer required");
  if (n < 0) throw new Error("Negative input");
  if (n === 0) return 0;
  if (n === 1) return 1;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

module.exports = { isPalindrome, factorial, fibonacci };
