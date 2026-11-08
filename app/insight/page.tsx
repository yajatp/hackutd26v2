import type { Metadata } from "next";
import InsightScreen from "./InsightScreen";
import "@/app/ui/motion.css";
import "./insight.css";

export const metadata: Metadata = {
  title: "Avon insight",
  description: "Tonight's money and trucks, rate in vs rate out, potential breaches and what-if ripples, computed inside the avon SpacetimeDB module",
};

// Everything on this page is a public table the avon module writes (budget, flow_series,
// breach_risk, scenario); the page subscribes and calls what_if.
export default function InsightPage() {
  return <InsightScreen />;
}
