import type { ApiErrorBody } from "@oboishop/shared";
import { getSessionToken } from "./session";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
// Uploaded files (product images) are served from the API's origin, not
// under the /api/v1 prefix — strip it once here so callers don't repeat
// this string surgery everywhere they need to render an <img src>.
const API_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, "");

export function resolveUploadUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${API_ORIGIN}${path}`;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  auth?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = {};
  // Only set Content-Type when there's an actual body — Fastify's default
  // JSON body parser rejects an empty body when this header is present
  // (FST_ERR_CTP_EMPTY_JSON_BODY), which every no-payload POST (confirm,
  // etc.) would otherwise hit.
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getSessionToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiClientError(res.status, json ?? { error: { code: "UNKNOWN", message: "Noma'lum xatolik" } });
  }

  return json as T;
}

// Separate from apiFetch because a multipart body must NOT get a manual
// Content-Type header — the browser sets one (with the multipart boundary)
// only when it builds the request body itself from a FormData instance.
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}${path}`, { method: "POST", headers, body: formData });
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiClientError(res.status, json ?? { error: { code: "UNKNOWN", message: "Noma'lum xatolik" } });
  }
  return json as T;
}

// Binary faylni (backup va h.k.) auth header bilan yuklab, brauzerga
// "saqlash" dialogini chiqaradi — apiFetch JSON kutadi, shu sabab alohida.
export async function apiDownload(path: string, fallbackFilename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = getSessionToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { headers });

  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiClientError(res.status, json ?? { error: { code: "UNKNOWN", message: "Noma'lum xatolik" } });
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
