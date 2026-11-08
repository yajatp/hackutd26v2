import type { Metadata } from "next";
import "./globals.css";
import "./fonts.css";

// No web fonts from a CDN: Darkroom must run on a box with no internet. Barlow ships in public/fonts.
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
