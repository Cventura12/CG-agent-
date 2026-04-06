import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";

export function formatLongDate(value: Date | string): string {
  const date = typeof value === "string" ? parseISO(value) : value;
  return isValid(date) ? format(date, "EEEE, MMMM d") : "Unknown date";
}

export function formatShortDate(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "MMM d") : "Unknown";
}

export function formatTimestamp(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "MMM d, h:mm a") : "Unknown";
}

export function formatTimeAgo(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? formatDistanceToNowStrict(date, { addSuffix: true }) : "Unknown";
}

export function formatMonoTime(value: string): string {
  const date = parseISO(value);
  return isValid(date) ? format(date, "MMM d · HH:mm") : "Unknown";
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatHoursMinutes(hours: number): string {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);

  if (wholeHours <= 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${wholeHours}h`;
  }

  return `${wholeHours}h ${minutes}m`;
}

export function initialsFromName(name: string): string {
  const tokens = name
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (tokens.length === 0) {
    return "GC";
  }

  return tokens.map((token) => token[0]?.toUpperCase() ?? "").join("");
}


