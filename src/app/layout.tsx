import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nuke", template: "%s · Nuke" },
  description: "Private hosting for HTML files and folders.",
  icons: { icon: [{ url: "/nuke.svg", type: "image/svg+xml" }], shortcut: "/nuke.svg" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#000000", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}