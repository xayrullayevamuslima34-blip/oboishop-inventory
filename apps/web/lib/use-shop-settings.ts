"use client";

import { useQuery } from "@tanstack/react-query";
import type { ShopSettings } from "@oboishop/shared";
import { apiFetch } from "./api-client";

export const SHOP_SETTINGS_QUERY_KEY = ["settings", "shop"];

// Do'kon rekvizitlari chek va chop etiladigan hujjatlar sarlavhasida kerak,
// ya'ni bir necha sahifada. Sozlama kamdan-kam o'zgargani uchun uzoq
// `staleTime` — har sahifa almashganda qayta so'rov yubormaslik uchun.
export function useShopSettings() {
  return useQuery({
    queryKey: SHOP_SETTINGS_QUERY_KEY,
    queryFn: () => apiFetch<ShopSettings>("/settings/shop"),
    staleTime: 5 * 60 * 1000,
  });
}
