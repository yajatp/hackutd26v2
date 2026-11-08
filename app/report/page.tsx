import type { Metadata } from "next";
import ReportScreen from "./ReportScreen";
import "./report.css";

export const metadata: Metadata = {
  title: "Darkroom · incident report",
  description: "One incident rebuilt from the tamper-evident Darkroom log, ready to print or save as PDF",
};

// /report?incident=INC-0001 shows that incident; with no parameter, the newest.
export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).incident;
  const requested = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  return <ReportScreen requested={requested} />;
}
