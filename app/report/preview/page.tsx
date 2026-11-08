import type { Metadata } from "next";
import PreviewScreen from "./PreviewScreen";
import "../report.css";

export const metadata: Metadata = {
  title: "SAMPLE · Darkroom incident report",
  description: "A made-up record for checking the report's print design. Not from a box.",
};

// /report/preview?case=clean|rollback|tampering: the report on a sample log, clearly marked SAMPLE.
export default async function ReportPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).case;
  const c = Array.isArray(raw) ? raw[0] : raw;
  const which = c === "rollback" || c === "tampering" ? c : "clean";
  return <PreviewScreen which={which} />;
}
