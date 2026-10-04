/** Terima hanya tautan HTTPS tanpa kredensial atau port khusus. */
export function isSafeHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname.includes(".") &&
      url.username === "" &&
      url.password === "" &&
      url.port === ""
    );
  } catch {
    return false;
  }
}

/** Mengembalikan tautan yang aman dibuka di tab baru, atau null. */
export function safeHttpsUrl(value?: string | null): string | null {
  const candidate = value?.trim() ?? "";
  return candidate && isSafeHttpsUrl(candidate) ? candidate : null;
}
