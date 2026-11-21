/**
 * # layout.tsx - the HTML shell around every page: font, page title, toast messages
 */
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeadPilot: AI lead triage for real-estate sales",
  description: "Rank inbound property leads, see what each buyer wants, and know who to call next.",
};

// Wrap every page in the shared fonts and the toast area.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="h-dvh font-sans">
        {children}
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
