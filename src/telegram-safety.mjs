const REDACTED = "***";

export function getTelegramErrorStatus(error) {
  const raw =
    error?.error_code ??
    error?.error?.error_code ??
    error?.status ??
    error?.response?.statusCode ??
    error?.response?.status ??
    null;

  const status = Number(raw);
  return Number.isFinite(status) ? status : null;
}

export function getTelegramRetryAfter(error) {
  const raw =
    error?.parameters?.retry_after ??
    error?.error?.parameters?.retry_after ??
    error?.response?.body?.parameters?.retry_after ??
    null;

  if (raw === null || raw === undefined || raw === "") return null;

  const retryAfter = Number(raw);
  return Number.isFinite(retryAfter) ? retryAfter : null;
}

export function shouldStopPollingForTelegramError(error) {
  return getTelegramErrorStatus(error) === 401;
}

export function formatSafeErrorForLog(error) {
  const status = getTelegramErrorStatus(error) ?? "unknown";
  const code = error?.code ?? error?.error?.code ?? "unknown";
  const message = sanitizeLogValue(
    error?.description ??
      error?.message ??
      error?.error?.description ??
      "unknown",
  );
  const retryAfter = getTelegramRetryAfter(error);
  const retryPart = retryAfter === null ? "" : ` retry_after=${retryAfter}`;
  return `status=${status} code=${code}${retryPart} message=${message}`;
}

export function formatTelegramUserError(error) {
  const status = getTelegramErrorStatus(error);
  if (status === 401) return "Telegram bot token 인증 실패. 기존 프로세스 중지 후 토큰 갱신 필요함.";
  if (status === 403) return "Telegram 권한 없음. 해당 채팅/동작은 재시도 중지 필요함.";
  if (status === 429) {
    const retryAfter = getTelegramRetryAfter(error);
    return retryAfter
      ? `Telegram 속도 제한. ${retryAfter}초 후 재시도 필요함.`
      : "Telegram 속도 제한. 잠시 후 재시도 필요함.";
  }

  return sanitizeLogValue(error?.description ?? error?.message ?? "unknown error");
}

export function sanitizeLogValue(value) {
  return String(value)
    .replace(/\d{8,}:[A-Za-z0-9_-]{20,}/g, REDACTED)
    .replace(/https:\/\/api\.telegram\.org\/bot[^/\s]+/gi, `https://api.telegram.org/bot${REDACTED}`)
    .replace(/\s+/g, " ")
    .slice(0, 240);
}
