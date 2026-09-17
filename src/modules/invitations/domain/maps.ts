const GOOGLE_MAP_HOSTS = new Set([
  "google.com",
  "www.google.com",
  "maps.google.com",
]);

/** Accept only URLs produced by Google Maps' "Embed a map" share option. */
export function isGoogleMapEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !GOOGLE_MAP_HOSTS.has(url.hostname) ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== ""
    )
      return false;
    return (
      url.pathname === "/maps/embed" &&
      (url.searchParams.get("pb")?.trim().length ?? 0) > 0
    );
  } catch {
    return false;
  }
}

/** Returns a safe iframe source, or null when no exact embed pin was supplied. */
export function googleMapEmbedUrl(value?: string | null): string | null {
  const candidate = value?.trim() ?? "";
  if (!candidate || !isGoogleMapEmbedUrl(candidate)) return null;
  const url = new URL(candidate);
  url.hostname = "www.google.com";
  return url.href;
}

/** Keeps the host-provided destination intact instead of guessing from an address. */
export function mapDirectionsUrl(value?: string | null): string | null {
  const candidate = value?.trim() ?? "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? candidate : null;
  } catch {
    return null;
  }
}

/** Builds a clearly approximate preview from venue text when no exact embed exists. */
export function approximateGoogleMapEmbedUrl(
  venue: string,
  address: string,
): string {
  const query = [venue.trim(), address.trim()].filter(Boolean).join(", ");
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}
