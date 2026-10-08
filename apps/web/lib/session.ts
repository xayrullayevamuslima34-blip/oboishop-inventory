// Token cookie shared between the browser (api-client attaches it as a
// Bearer header when calling the Fastify API directly) and middleware.ts
// (route guard). Deliberately NOT httpOnly: this is a single-tenant internal
// tool with no third-party scripts/public content, so the XSS risk that
// httpOnly usually guards against is low here, and a non-httpOnly cookie
// lets the SPA-style client fetch the API cross-origin without a Next.js
// backend-for-frontend proxy on every single request. If the app ever
// embeds untrusted content, revisit this.
export const SESSION_COOKIE = "oboishop_token";

export function setSessionToken(token: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${60 * 60 * 12}; SameSite=Lax${secure}`;
}

export function clearSessionToken() {
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getSessionToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
