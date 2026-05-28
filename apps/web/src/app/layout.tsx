import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HelpDesk OS",
  description: "Sistema de soporte TI multi-empresa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
