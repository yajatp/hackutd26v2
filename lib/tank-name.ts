// One name for a tank on every screen: Phone 1's buttons, the model's labels, panels, signs and
// the station table, so a tank called out loud reads the same words wherever someone looks.
// "S5_FACILITY_C" in S5 -> "S5 · Facility C tank"; "McMullen_County_11" in S1 ->
// "S1 · McMullen County 11 tank". All-caps words are title-cased, short ones (a facility letter
// like C or AB) stay capitals, and mixed-case words stay as named.
export function tankLabel(facility_id: string, system_id: string): string {
  const rest = facility_id.startsWith(system_id + "_") ? facility_id.slice(system_id.length + 1) : facility_id;
  const words = rest.split("_").filter(Boolean).map((w) => (w.length > 2 && w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w));
  return `${system_id} · ${words.join(" ")} tank`;
}
