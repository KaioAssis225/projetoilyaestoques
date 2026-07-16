import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estoque | Ilya",
  description: "Visão consolidada dos estoques Ilya.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
