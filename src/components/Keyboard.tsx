import { useMemo } from "preact/hooks";
import type { KeyDef, KeyMode, KeySettings } from "../types";
import { SENSOR_COLS } from "../types";

interface KeyboardProps {
  layout: KeyDef[];
  keys: Record<number, KeySettings>;
  selection: Set<number>;
  /** Micrometres indexed by `row * 21 + col`; omit to hide the live overlay. */
  sensors?: number[];
  maxTravel: number;
  showSensors: boolean;
  onKeyClick: (id: number, additive: boolean) => void;
}

const UNIT = 44;
const GAP = 5;

const MODE_CLASS: Record<KeyMode, string> = {
  global: "is-global",
  single: "is-single",
  rapidtrigger: "is-rapid",
};

export function Keyboard({
  layout,
  keys,
  selection,
  sensors,
  maxTravel,
  showSensors,
  onKeyClick,
}: KeyboardProps) {
  const rows = useMemo(() => {
    const grouped = new Map<number, KeyDef[]>();
    for (const key of layout) {
      const bucket = grouped.get(key.y);
      if (bucket) bucket.push(key);
      else grouped.set(key.y, [key]);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, items]) => [...items].sort((a, b) => a.x - b.x));
  }, [layout]);

  const width = useMemo(
    () => rows[0]?.reduce((sum, key) => Math.max(sum, key.x + key.w), 0) ?? 16,
    [rows],
  );

  return (
    <div class="keyboard" style={{ "--kb-width": `${width * UNIT + (width - 1) * GAP}px` }}>
      {rows.map((items, rowIndex) => (
        <div class="keyboard__row" key={rowIndex}>
          {items.map((key) => {
            const settings = keys[key.id];
            const travelUm = showSensors && sensors ? sensors[key.row * SENSOR_COLS + key.col] ?? 0 : 0;
            const travelMm = travelUm / 1000;
            const ratio = maxTravel > 0 ? Math.min(1, travelMm / maxTravel) : 0;
            const selected = selection.has(key.id);

            return (
              <button
                type="button"
                key={key.id}
                class={`key ${MODE_CLASS[settings?.mode ?? "global"]}${selected ? " is-selected" : ""}${
                  showSensors && travelMm > 0.05 ? " is-live" : ""
                }`}
                style={{
                  width: `${key.w * UNIT + (key.w - 1) * GAP}px`,
                  height: `${UNIT}px`,
                  "--travel": `${ratio * 100}%`,
                }}
                title={`${key.label} · HID ${key.id}`}
                aria-pressed={selected}
                onClick={(e) => onKeyClick(key.id, e.shiftKey || e.ctrlKey || e.metaKey)}
              >
                <span class="key__fill" aria-hidden="true" />
                <span class="key__label">{key.label}</span>
                {settings && settings.mode !== "global" ? (
                  <span class="key__badge">
                    {settings.mode === "rapidtrigger" ? "RT" : `${settings.actuation.toFixed(1)}`}
                  </span>
                ) : null}
                {settings?.mode === "rapidtrigger" ? (
                  <span class="key__rt">
                    {settings.rt_press.toFixed(2)}/{settings.rt_release.toFixed(2)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
