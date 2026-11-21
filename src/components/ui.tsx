import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";

/* ------------------------------------------------------------------ Slider */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  digits?: number;
  hint?: string;
  disabled?: boolean;
  accent?: "primary" | "rose" | "amber" | "emerald";
  /** Optional live callback for pure UI controls; HID sliders only use onCommit. */
  onLiveChange?: (value: number) => void;
  /**
   * Commit a value to the keyboard. Return (or resolve to) `false` when the
   * keyboard refused it, and the slider rolls the draft back to `value`
   * instead of displaying a number the hardware does not hold.
   */
  onCommit: (value: number) => boolean | Promise<boolean> | void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = "mm",
  digits = 2,
  hint,
  disabled,
  accent = "primary",
  onLiveChange,
  onCommit,
}: SliderProps) {
  const [draft, setDraft] = useState(value);
  const dragging = useRef(false);
  const keyTimer = useRef<number | null>(null);
  const latestValue = useRef(value);
  latestValue.current = value;

  const clearKeyTimer = () => {
    if (keyTimer.current != null) {
      clearTimeout(keyTimer.current);
      keyTimer.current = null;
    }
  };

  // Follow external changes unless the user is actively dragging.
  useEffect(() => {
    clearKeyTimer();
    if (!dragging.current) setDraft(value);
  }, [value, disabled]);

  useEffect(() => clearKeyTimer, []);

  const commit = (next: number) => {
    clearKeyTimer();
    setDraft(next);
    const outcome = onCommit(next) as boolean | Promise<boolean> | undefined;
    if (outcome instanceof Promise) {
      void outcome.then((ok) => {
        if (ok === false) setDraft(latestValue.current);
      });
    } else if (outcome === false) {
      setDraft(latestValue.current);
    }
  };

  const stepStr = String(step);
  const dotIndex = stepStr.indexOf(".");
  const precision = Math.min(6, Math.max(digits, dotIndex === -1 ? 0 : stepStr.length - dotIndex - 1));

  // Arrow keys on a range input fire one `change` per press and repeat while
  // held, which would put one HID write per step on the wire. Adjust the
  // draft instead and commit once the key pauses.
  const commitSoon = (next: number) => {
    const factor = 10 ** precision;
    const snapped = Math.round(Math.min(max, Math.max(min, next)) * factor) / factor;
    setDraft(snapped);
    onLiveChange?.(snapped);
    clearKeyTimer();
    keyTimer.current = window.setTimeout(() => {
      keyTimer.current = null;
      commit(snapped);
    }, 300);
  };

  const rawFill = max > min ? ((draft - min) / (max - min)) * 100 : 0;
  const fill = Math.min(100, Math.max(0, rawFill));

  return (
    <label class={`slider slider--${accent}${disabled ? " is-disabled" : ""}`}>
      <span class="slider__head">
        <span class="slider__label">
          {label}
          {hint ? <em class="slider__hint">{hint}</em> : null}
        </span>
        <output class="slider__value">
          {draft.toFixed(digits)}
          <span class="slider__unit">{unit}</span>
        </output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        style={{ "--fill": `${fill}%` }}
        aria-valuetext={`${draft.toFixed(digits)}${unit ? ` ${unit}` : ""}`}
        onPointerDown={(e) => {
          dragging.current = true;
          clearKeyTimer();
          try {
            (e.currentTarget as HTMLInputElement).setPointerCapture(e.pointerId);
          } catch {
            /* ignore environments without pointer capture */
          }
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
          setDraft(latestValue.current);
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget as HTMLInputElement;
          const stepValue = Number(el.step) || step;
          let next: number | null = null;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            next = Math.min(max, Number(el.value) + stepValue);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            next = Math.max(min, Number(el.value) - stepValue);
          }
          if (next != null) {
            e.preventDefault();
            commitSoon(next);
          }
        }}
        onInput={(e) => {
          const next = Number((e.currentTarget as HTMLInputElement).value);
          setDraft(next);
          onLiveChange?.(next);
        }}
        onChange={(e) => {
          dragging.current = false;
          commit(Number((e.currentTarget as HTMLInputElement).value));
        }}
      />
      <span class="slider__scale">
        <span>{min.toFixed(digits)}</span>
        <span>{max.toFixed(digits)}</span>
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------- Toggle */

interface ToggleProps {
  label: string;
  hint?: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ label, hint, title, checked, disabled, onChange }: ToggleProps) {
  return (
    <label class={`toggle${disabled ? " is-disabled" : ""}`} title={title}>
      <span class="toggle__text">
        <span class="toggle__label">{label}</span>
        {hint ? <em class="toggle__hint">{hint}</em> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange((e.currentTarget as HTMLInputElement).checked)}
      />
      <span class="toggle__track" aria-hidden="true">
        <span class="toggle__thumb" />
      </span>
    </label>
  );
}

/* ---------------------------------------------------------------- Segmented */

interface SegmentedProps<T extends string | number> {
  value: T;
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function Segmented<T extends string | number>({
  value,
  options,
  disabled,
  onChange,
}: SegmentedProps<T>) {
  return (
    <div class="segmented" role="group">
      {options.map(([optionValue, label]) => (
        <button
          key={String(optionValue)}
          type="button"
          class={optionValue === value ? "is-active" : ""}
          disabled={disabled}
          aria-pressed={optionValue === value}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------- Select */

interface SelectProps<T extends string | number> {
  value: T;
  options: readonly (readonly [T, string])[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function Select<T extends string | number>({
  value,
  options,
  disabled,
  onChange,
}: SelectProps<T>) {
  return (
    <div class="select">
      <select
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const raw = (e.currentTarget as HTMLSelectElement).value;
          const match = options.find(([optionValue]) => String(optionValue) === raw);
          if (match) onChange(match[0]);
        }}
      >
        {options.map(([optionValue, label]) => (
          <option key={String(optionValue)} value={String(optionValue)}>
            {label}
          </option>
        ))}
      </select>
      <span class="select__chevron" aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------- Button */

interface ButtonProps {
  children: ComponentChildren;
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}

export function Button({ children, variant = "ghost", disabled, onClick, title }: ButtonProps) {
  return (
    <button
      type="button"
      class={`btn btn--${variant}`}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------------- Chip */

interface ChipProps {
  children: ComponentChildren;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export function Chip({ children, active, disabled, onClick }: ChipProps) {
  return (
    <button
      type="button"
      class={`chip${active ? " is-active" : ""}`}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- Panel */

export function Panel({
  title,
  description,
  actions,
  wide,
  children,
}: {
  title: string;
  description?: string;
  actions?: ComponentChildren;
  /** Stretch across every column, used to avoid a lonely trailing panel. */
  wide?: boolean;
  children: ComponentChildren;
}) {
  return (
    <section class={`panel${wide ? " panel--wide" : ""}`}>
      <header class="panel__head">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div class="panel__actions">{actions}</div> : null}
      </header>
      <div class="panel__body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------- Stat readout */

export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary" | "amber" | "rose";
}) {
  return (
    <div class={`stat${tone ? ` stat--${tone}` : ""}`}>
      <span class="stat__label">{label}</span>
      <span class="stat__value">{value}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- Field row */

export function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ComponentChildren;
}) {
  return (
    <div class="row">
      <span class="row__text">
        <span class="row__label">{label}</span>
        {hint ? <em class="row__hint">{hint}</em> : null}
      </span>
      <div class="row__control">{children as JSX.Element}</div>
    </div>
  );
}
