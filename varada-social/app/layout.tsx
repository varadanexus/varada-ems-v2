import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import { EmsSessionBridge } from "@/components/auth/ems-session-bridge";

const bodyFont = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Nexus Social",
    template: "%s · Nexus Social",
  },
  description:
    "AI-powered social media operations for Varada Nexus Private Limited.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} min-h-screen antialiased`}
      >
        <EmsSessionBridge />
        {children}
      </body>
    </html>
  );
}
