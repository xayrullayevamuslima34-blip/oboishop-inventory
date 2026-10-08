import { redirect } from "next/navigation";

// Eski havola/xatcho'plar uchun orqaga moslik — kontragent bo'limi "Mijozlar"
// nomi bilan almashtirilgan, interfeysda "kontragent" tushunchasi ishlatilmaydi.
export default function ContragentsRedirectPage() {
  redirect("/customers");
}
