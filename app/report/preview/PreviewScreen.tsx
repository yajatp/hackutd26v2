"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { ReportView } from "../ReportView";
import { sampleInput, type SampleCase } from "../sample";

const noop = () => () => {};

// Rendered in the browser only, so times use this device's time zone like the live report.
export default function PreviewScreen({ which }: { which: SampleCase }) {
  const host = useSyncExternalStore(noop, () => window.location.hostname, () => null);
  if (host === null) return null;
  return (
    <>
      <p className="report-sample" role="note">
        SAMPLE: a made-up record for checking the print design, not from a box.{" "}
        <span className="report-no-print">
          Show it{" "}
          <Link href="/report/preview">clean</Link>,{" "}
          <Link href="/report/preview?case=rollback">with a rollback</Link> or{" "}
          <Link href="/report/preview?case=tampering">with tampering</Link>.
        </span>
      </p>
      <ReportView s={sampleInput(which)} requested="INC-0001" host={host} db="darkroom" />
    </>
  );
}
