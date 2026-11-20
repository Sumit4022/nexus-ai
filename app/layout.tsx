import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NEXUS AI — Your private AI workspace",
    template: "%s · NEXUS AI",
  },
  description: "A private multi-agent workspace for coding, document analysis, web research, and personal knowledge retrieval.",
  applicationName: "NEXUS AI",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
