function firstForwardedValue(value: string | null) {
  return String(value || "").split(",")[0].trim();
}

function isInternalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname === "web"
  );
}

export function sanitizeReturnPath(candidate: unknown) {
  const value = typeof candidate === "string" ? candidate.trim() : "";
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

export function sanitizeCallbackOrigin(candidate: unknown) {
  const value = typeof candidate === "string" ? candidate.trim() : "";
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function resolveTelegramAuthOrigin(request: Request) {
  const requestOrigin = sanitizeCallbackOrigin(request.url);
  const requestUrl = requestOrigin ? new URL(requestOrigin) : null;
  const requestOriginIsInternal = requestUrl ? isInternalHostname(requestUrl.hostname) : true;

  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProto = firstForwardedValue(request.headers.get("x-forwarded-proto")) || "https";
  if (forwardedHost) {
    const forwardedOrigin = sanitizeCallbackOrigin(`${forwardedProto}://${forwardedHost}`);
    const forwardedIsHttpsUpgrade = requestUrl?.protocol === "http:" && forwardedProto === "https";
    if (forwardedOrigin && (requestOriginIsInternal || forwardedIsHttpsUpgrade)) {
      return forwardedOrigin;
    }
  }

  if (requestOrigin && !requestOriginIsInternal) {
    return requestOrigin;
  }

  return (
    sanitizeCallbackOrigin(process.env.WEBAPP_BASE_URL) ||
    sanitizeCallbackOrigin(process.env.UI_BASE_URL) ||
    requestOrigin ||
    null
  );
}
