import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Oboishop Sklad",
  description: "Oboi-shop uchun ombor hisob-kitob tizimi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
