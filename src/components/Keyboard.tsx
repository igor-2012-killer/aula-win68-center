import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useTravel, type TravelBus } from "../store";
import type { KeyDef, KeyMode, KeyboardState, ModTapAssignment, SnapTap } from "../types";
import { SENSOR_COLS } from "../types";

interface KeyboardProps {
  layout: KeyDef[];
  keys: KeyboardState["keys"];
  selection: Set<number>;
  travelBus: TravelBus;
  maxTravel: number;
  /** Shared actuation, drawn on keys that still follow the global point. */
  globalActuation: number;
  snapTap: SnapTap | null;
  modTap: ModTapAssignment[];
  unitMm: string;
  showSensors: boolean;
  onKeyClick: (id: number, additive: boolean) => void;
  onSelectMany: (ids: number[]) => void;
}

const UNIT = 44;
const GAP = 5;
const GAP_RATIO = GAP / UNIT;

const MODE_CLASS: Record<KeyMode, string> = {
  global: "is-global",
  single: "is-single",
  rapidtrigger: "is-rapid",
};

function compactMm(value: number): string {
  return value.toFixed(2).replace(/^0(?=\.)/, "").replace(/\.?0+$/, "");
}

export function Keyboard({
  layout,
  keys,
  selection,
  travelBus,
  maxTravel,
  globalActuation,
  snapTap,
  modTap,
  unitMm,
  showSensors,
  onKeyClick,
  onSelectMany,
}: KeyboardProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [unit, setUnit] = useState(UNIT);
  const sensors = useTravel(travelBus, showSensors);
  const dragRef = useRef<{
    active: boolean;
    additive: boolean;
    base: number[];
    ids: Set<number>;
    moved: boolean;
    startId: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const clearSuppressTimer = useRef<number | null>(null);

  const snapTapSet = useMemo(
    () => (snapTap ? new Set([snapTap.key_a, snapTap.key_b]) : new Set<number>()),
    [snapTap],
  );
  const modTapMap = useMemo(() => new Map(modTap.map((item) => [item.key_id, item])), [modTap]);

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

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => {
      const available = Math.max(0, el.clientWidth - 2);
      if (available <= 0 || width <= 0) return;
      const next = available / (width + (width - 1) * GAP_RATIO);
      setUnit(Math.max(28, Math.min(44, next)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [width]);

  useEffect(() => {
    const endDrag = () => {
      if (!dragRef.current) return;
      const moved = dragRef.current.moved;
      dragRef.current = null;
      if (moved) {
        if (clearSuppressTimer.current != null) clearTimeout(clearSuppressTimer.current);
        clearSuppressTimer.current = window.setTimeout(() => {
          clearSuppressTimer.current = null;
          suppressClick.current = false;
        }, 0);
      }
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      if (clearSuppressTimer.current != null) clearTimeout(clearSuppressTimer.current);
    };
  }, []);

  const gap = unit * GAP_RATIO;
  const natural = width * unit + (width - 1) * gap;

  return (
    <div class="keyboard-frame" ref={frameRef}>
      <div class="keyboard" style={{ width: `${natural}px`, "--kb-gap": `${gap}px` }}>
        {rows.map((items, rowIndex) => (
          <div class="keyboard__row" key={rowIndex}>
            {items.map((key) => {
              const settings = keys[key.id];
              const travelUm = showSensors ? (sensors[key.row * SENSOR_COLS + key.col] ?? 0) : 0;
              const travelMm = travelUm / 1000;
              const ratio = maxTravel > 0 ? Math.min(1, travelMm / maxTravel) : 0;
              const selected = selection.has(key.id);
              const pressed = showSensors && travelMm > 0.05;
              const actuationMm =
                settings?.mode === "rapidtrigger"
                  ? null
                  : settings?.mode === "single"
                    ? settings.actuation
                    : globalActuation;
              const fired =
                pressed && actuationMm != null && maxTravel > 0 && travelMm + 0.001 >= actuationMm;
              const markRatio =
                actuationMm != null && maxTravel > 0
                  ? Math.min(1, Math.max(0, actuationMm / maxTravel))
                  : undefined;
              const isSnapTap = snapTapSet.has(key.id);
              const keyModTap = modTapMap.get(key.id);
              const advBadge = isSnapTap && keyModTap ? "ST+" : isSnapTap ? "ST" : keyModTap ? "MT" : null;

              const detailParts = [key.label];
              if (settings?.mode === "rapidtrigger") {
                detailParts.push(`RT ${settings.rt_press.toFixed(2)}/${settings.rt_release.toFixed(2)} ${unitMm}`);
              } else if (settings?.mode === "single") {
                detailParts.push(`${settings.actuation.toFixed(2)} ${unitMm}`);
              } else {
                detailParts.push(`${globalActuation.toFixed(2)} ${unitMm}`);
              }
              if (isSnapTap) detailParts.push("Snap Tap");
              if (keyModTap) detailParts.push("Mod-Tap");
              detailParts.push(`HID ${key.id}`);

              return (
                <button
                  type="button"
                  key={key.id}
                  class={`key ${MODE_CLASS[settings?.mode ?? "global"]}${key.w >= 5 ? " key--space" : ""}${
                    selected ? " is-selected" : ""
                  }${pressed ? " is-live" : ""}${fired ? " is-fired" : ""}${
                    isSnapTap ? " has-snaptap" : ""
                  }${keyModTap ? " has-modtap" : ""}`}
                  style={{
                    width: `${key.w * unit + (key.w - 1) * gap}px`,
                    height: `${unit}px`,
                    "--travel": `${ratio * 100}%`,
                    "--mark-ratio": markRatio != null ? String(markRatio) : undefined,
                  }}
                  title={detailParts.join(" · ")}
                  aria-pressed={selected}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
                    suppressClick.current = false;
                    dragRef.current = {
                      active: true,
                      additive,
                      base: additive ? [...selection] : [],
                      ids: new Set([key.id]),
                      moved: false,
                      startId: key.id,
                    };
                  }}
                  onPointerEnter={() => {
                    const drag = dragRef.current;
                    if (!drag || !drag.active) return;
                    if (!drag.moved && key.id === drag.startId) return;
                    drag.moved = true;
                    suppressClick.current = true;
                    drag.ids.add(key.id);
                    const merged = drag.additive
                      ? [...new Set([...drag.base, ...drag.ids])]
                      : [...drag.ids];
                    onSelectMany(merged);
                  }}
                  onClick={(e) => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    onKeyClick(key.id, e.shiftKey || e.ctrlKey || e.metaKey);
                  }}
                >
                  <span class="key__fill" aria-hidden="true" />
                  {markRatio != null ? <span class="key__mark" aria-hidden="true" /> : null}
                  <span class="key__top">
                    <span class={`key__label${key.label.length > 3 ? " key__label--long" : ""}`}>{key.label}</span>
                    {advBadge ? (
                      <span class={`key__adv${isSnapTap ? " key__adv--st" : " key__adv--mt"}`}>{advBadge}</span>
                    ) : null}
                  </span>
                  {!pressed && settings && settings.mode !== "global" ? (
                    <span class="key__sub">
                      <span class="key__badge">
                        {settings.mode === "rapidtrigger" ? "RT" : settings.actuation.toFixed(2)}
                      </span>
                      {settings.mode === "rapidtrigger" ? (
                        <span class="key__rt">
                          {compactMm(settings.rt_press)}/{compactMm(settings.rt_release)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                  {pressed ? <span class="key__mm">{travelMm.toFixed(2)}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
