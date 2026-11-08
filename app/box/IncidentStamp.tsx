import c from "./chain.module.css";
import { Digits } from "./Digits";

// "INC-0001 OPEN" as a rubber stamp at the top of the incident section: red while the incident is
// open, mint once it is closed. It stamps in (scale 1.15 to 1 with a small shake, 300 ms) only when
// the entry that opened or closed it arrived while this screen was open, and never during a break
// (a rollback that removes the close changes the stamp back without stamping). The caller keys it by id
// and state, so a new incident or a close mounts a new stamp. While the log does not verify, the
// stamp dims: mint means verified, and a record that fails its check cannot vouch for itself.
export function IncidentStamp({ id, closed, fresh, broken = false }: { id: string; closed: boolean; fresh: boolean; broken?: boolean }) {
  return (
    <p className={[c.stamp, closed ? c.stampClosed : "", fresh ? c.stampFresh : "", broken ? c.stampBroken : ""].join(" ")} data-incident-stamp={closed ? "closed" : "open"}>
      <Digits text={`${id} ${closed ? "CLOSED" : "OPEN"}`} />
    </p>
  );
}
