import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RecallNet | Supply Chain Traceability",
  description: "Product batch traceability, distribution visibility and recall management.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
