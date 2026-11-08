import type { Metadata } from "next";
import SpacetimeScreen from "./SpacetimeScreen";
import "./spacetime.css";

export const metadata: Metadata = {
  title: "Avon on SpacetimeDB",
  description: "Every row change on the avon database as it lands, and which reducer writes which table",
};

// Second screen next to /console. Read-only: it subscribes and never calls a reducer.
export default function SpacetimePage() {
  return <SpacetimeScreen />;
}
