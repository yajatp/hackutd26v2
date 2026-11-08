import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Darkroom · join the team",
  description: "Type the one-use code a Commander gave you, and your name, to join the Darkroom incident room",
};

export default function JoinLayout({ children }: { children: ReactNode }) {
  return children;
}
