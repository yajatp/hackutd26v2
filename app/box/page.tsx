import type { Metadata } from "next";
import BoxScreen from "./BoxScreen";

export const metadata: Metadata = {
  title: "Darkroom · incident room",
  description: "Incident, scope board and team chat on the Darkroom box, rebuilt from a tamper-evident log",
};

export default function BoxPage() {
  return <BoxScreen />;
}
