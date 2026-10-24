export type AddressMode = "search" | "url";

const TRACKER_HOSTS = [
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "googlesyndication.com",
  "connect.facebook.net",
  "facebook.com/tr",
  "hotjar.com",
  "clarity.ms",
  "segment.io",
  "amplitude.com",
  "mixpanel.com",
  "adnxs.com",
  "scorecardresearch.com",
  "quantserve.com",
];

export const TRACKER_INJECTION = `
(function () {
  var blocked = ${JSON.stringify(TRACKER_HOSTS)};
  function isBlocked(value) {
    try {
      var raw = String(value || '').toLowerCase();
      return blocked.some(function (host) { return raw.indexOf(host) !== -1; });
    } catch (_) { return false; }
  }
  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function (input, init) {
      var target = typeof input === 'string' ? input : (input && input.url);
      if (isBlocked(target)) return Promise.reject(new Error('Noctra blocked tracker'));
      return originalFetch.call(this, input, init);
    };
  }
  var originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isBlocked(url)) { this.__noctraBlocked = true; }
    return originalOpen.apply(this, arguments);
  };
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (this.__noctraBlocked) return;
    return originalSend.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    var originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isBlocked(url)) return false;
      return originalBeacon(url, data);
    };
  }
})();
true;
`;

export function isTrackerUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return TRACKER_HOSTS.some((host) => normalized.includes(host));
}

export function normalizeDestination(input: string, mode: AddressMode): string | null {
  const value = input.trim();
  if (!value) return null;

  if (mode === "search") {
    return `noctra://search/${encodeURIComponent(value)}`;
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function displayAddress(url: string | null): string {
  if (!url) return "Pesquise ou digite um endereço";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "noctra:" && parsed.hostname === "search") {
      return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    }
    return parsed.host + parsed.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export function tabTitle(url: string | null, fallback = "Nova aba privada"): string {
  if (!url) return fallback;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || fallback;
  } catch {
    return fallback;
  }
}
