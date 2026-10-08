import { redirect } from "next/navigation";

// Eski havola/xatcho'plar uchun orqaga moslik — mijoz kartasi endi
// /customers/[id] manzilida.
export default function ContragentDetailRedirectPage({ params }: { params: { id: string } }) {
  redirect(`/customers/${params.id}`);
}
