import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IdentityProvider } from "@/components/IdentityProvider";
import { Shell } from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "PeopleLedger — Developer console",
  description: "Inspect and exercise the PeopleLedger build with synthetic data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <IdentityProvider>
          <Shell>{children}</Shell>
        </IdentityProvider>
      </body>
    </html>
  );
}
