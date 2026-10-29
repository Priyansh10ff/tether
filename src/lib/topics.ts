// Subscription matching. "order.paid" matches "order.paid", "order.*", "*".
export function topicMatches(pattern: string, type: string) {
  if (pattern === "*" || pattern === type) return true;
  if (pattern.endsWith(".*")) return type.startsWith(pattern.slice(0, -1));
  return false;
}

export function isValidEventType(type: string) {
  return /^[a-z0-9_]+(\.[a-z0-9_]+)+$/.test(type) && type.length <= 100;
}
