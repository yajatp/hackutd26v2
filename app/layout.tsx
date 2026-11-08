import type { Metadata } from "next";
import "./globals.css";

// No next/font/google: Darkroom must run on a box with no internet.
export const metadata: Metadata = {
  title: "Avon",
  description: "What broke, the cheapest fix, and which sensors to trust",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
