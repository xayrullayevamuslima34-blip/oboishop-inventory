"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@oboishop/shared";
import { apiFetch, ApiClientError } from "./api-client";
import { clearSessionToken } from "./session";

export function useAuth() {
  const router = useRouter();

  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiFetch<AuthUser>("/auth/me"),
    retry: false,
  });

  function logout() {
    clearSessionToken();
    router.replace("/login");
  }

  if (query.error instanceof ApiClientError && query.error.status === 401) {
    // Token expired/invalid — clear it and bounce to login on next render.
    clearSessionToken();
  }

  return { user: query.data, isLoading: query.isLoading, logout };
}
