const WAKE_PHRASE_PATTERN =
  /(?:hey|hi|okay|ok)\s+(?:dami|dummy|demi|dammy|darmi|danny|day\s*me|dar\s*me)(?:\s+ai)?\b|^\s*dami(?:\s+ai)?\b/i;

function parseWakeUtterance(value) {
  const heard = String(value || "").trim();
  const match = heard.match(WAKE_PHRASE_PATTERN);
  if (!match) return null;
  return {
    heard,
    command: heard
      .slice((match.index || 0) + match[0].length)
      .replace(/^[,.:;\s-]+/, "")
      .trim(),
  };
}

module.exports = { WAKE_PHRASE_PATTERN, parseWakeUtterance };
