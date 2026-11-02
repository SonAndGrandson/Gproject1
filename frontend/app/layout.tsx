import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uptime Monitor Dashboard",
  description: "Live monitor status and recent latency history",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <body>{children}</body>
    </html>
  );
}
