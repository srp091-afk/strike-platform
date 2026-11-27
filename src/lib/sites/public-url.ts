const CANONICAL_ORIGIN = "https://strikeplatform.io";

export function siteSubdomainsEnabled() {
  return process.env.NEXT_PUBLIC_SITE_SUBDOMAINS_ENABLED === "true";
}

function configuredOrigin() {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".vercel.app");
}

/** Origin for a link that opens without a wildcard subdomain. */
export function publicSiteOrigin() {
  const configured = configuredOrigin();
  if (!configured) return CANONICAL_ORIGIN;
  try {
    const host = new URL(configured).hostname;
    if (isLocalHost(host)) return configured;
  } catch {
    return CANONICAL_ORIGIN;
  }
  return CANONICAL_ORIGIN;
}

export function getPublicSiteUrl(subdomain: string) {
  const slug = subdomain.trim().toLowerCase();
  if (siteSubdomainsEnabled()) return `https://${slug}.strikeplatform.io`;
  return `${publicSiteOrigin()}/s/${slug}`;
}

export function getPublicSiteDisplayUrl(subdomain: string) {
  const slug = subdomain.trim().toLowerCase();
  if (siteSubdomainsEnabled()) return `${slug}.strikeplatform.io`;
  return `${publicSiteOrigin().replace(/^https?:\/\//, "")}/s/${slug}`;
}

export async function copyText(value: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Clipboard API can be blocked; the textarea path below still copies.
  }
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "true");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
