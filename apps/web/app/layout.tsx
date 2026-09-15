import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TradeVision",
  description:
    "Diario de trading verificado + analítica forense + Mentor IA. La sofisticación no está en las métricas, sino en la trazabilidad.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={inter.variable}>
      <body>
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
