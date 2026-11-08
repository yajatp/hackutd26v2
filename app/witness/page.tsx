import type { Metadata } from "next";
import WitnessScreen from "./WitnessScreen";

export const metadata: Metadata = {
  title: "Darkroom · witness",
  description: "This phone remembers the newest Darkroom log entry it saw and checks every change against it",
};

export default function WitnessPage() {
  return <WitnessScreen />;
}
