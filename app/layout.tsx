import type { Metadata } from "next";
import "./globals.css";

// No next/font/google: Darkroom must run on a box with no internet.
export const metadata: Metadata = {
  title: "Darkroom",
  description: "Incident command for when the attacker already owns your network",
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
