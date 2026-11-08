"use client";

// A row of buttons for picking one option; the chosen one is filled and ticked.
export function Choice<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; disabled: boolean }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2" disabled={disabled}>
      <legend className="mb-1 w-full text-sm font-medium">{label}</legend>
      {options.map(o => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`btn ${value === o ? "btn-primary" : ""}`}
        >
          {value === o && <span aria-hidden="true">✓</span>}
          {o}
        </button>
      ))}
    </fieldset>
  );
}
