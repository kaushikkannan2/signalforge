import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalForge — turn buying signals into forged pipeline",
  description:
    "Plain-language product description in, evidence-cited pipeline out. ICP inference, buyer discovery, knowledge-graph reasoning, and human-approved multi-channel outreach.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
