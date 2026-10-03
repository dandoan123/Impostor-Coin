// Random choices for the game logic, taken from the system's secure generator.
const crypto = require('crypto');

const int = n => crypto.randomInt(n); // 0 .. n-1
const pick = arr => arr[int(arr.length)];

module.exports = { int, pick };
