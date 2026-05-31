import assert from "node:assert/strict";
import {
  formatSafeErrorForLog,
  formatTelegramUserError,
  getTelegramErrorStatus,
  getTelegramRetryAfter,
  shouldStopPollingForTelegramError,
} from "../src/telegram-safety.mjs";

const unauthorized = {
  error_code: 401,
  description: "Unauthorized",
};

assert.equal(getTelegramErrorStatus(unauthorized), 401);
assert.equal(getTelegramRetryAfter(unauthorized), null);
assert.equal(shouldStopPollingForTelegramError(unauthorized), true);
assert.match(formatTelegramUserError(unauthorized), /토큰|인증/);
assert.doesNotMatch(formatSafeErrorForLog(unauthorized), /retry_after=0/);

const forbidden = {
  error_code: 403,
  description: "Forbidden: bot was blocked by the user",
};

assert.equal(getTelegramErrorStatus(forbidden), 403);
assert.equal(shouldStopPollingForTelegramError(forbidden), false);
assert.match(formatTelegramUserError(forbidden), /권한|재시도/);

const tooManyRequests = {
  error_code: 429,
  description: "Too Many Requests: retry after 7",
  parameters: { retry_after: 7 },
};

assert.equal(getTelegramErrorStatus(tooManyRequests), 429);
assert.equal(getTelegramRetryAfter(tooManyRequests), 7);
assert.match(formatSafeErrorForLog(tooManyRequests), /retry_after=7/);

const fakeToken = ["1234567890", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"].join(":");
const tokenLikeMessage = {
  error_code: 401,
  description: `failed https://api.telegram.org/bot${fakeToken}/getUpdates`,
};

const formatted = formatSafeErrorForLog(tokenLikeMessage);
assert.equal(formatted.includes(fakeToken), false);
assert.match(formatted, /\*\*\*/);

console.log("telegram safety tests passed");
