import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { PRESET_LABELS, STRINGS, type Lang } from "./i18n";
import { useStore, useTravel, type TravelBus } from "./store";
import { useSensorStream } from "./use-sensor-stream";
import { SENSOR_COLS, type KeyDef } from "./types";
import { Keyboard } from "./components/Keyboard";
import { ActuationTab } from "./components/tabs/ActuationTab";
import { RapidTab } from "./components/tabs/RapidTab";
import { SnapTapTab } from "./components/tabs/SnapTapTab";
import { ModTapTab } from "./components/tabs/ModTapTab";
import { LightingTab } from "./components/tabs/LightingTab";
import { SensorsTab } from "./components/tabs/SensorsTab";
import { SystemTab } from "./components/tabs/SystemTab";
import { Button, Chip, Toggle } from "./components/ui";

type TabId = "actuation" | "rapid" | "snaptap" | "modtap" | "lighting" | "sensors" | "system";

type NavKey =
  | "navActuation"
  | "navRapid"
  | "navSnapTap"
  | "navModTap"
  | "navLighting"
  | "navSensors"
  | "navSystem";

const TABS: [TabId, NavKey][] = [
  ["actuation", "navActuation"],
  ["rapid", "navRapid"],
  ["snaptap", "navSnapTap"],
  ["modtap", "navModTap"],
  ["lighting", "navLighting"],
  ["sensors", "navSensors"],
  ["system", "navSystem"],
];

const KEY_TABS = new Set<TabId>(["actuation", "rapid", "snaptap", "modtap", "sensors"]);
const PRESET_TABS = new Set<TabId>(["actuation", "rapid", "sensors"]);
const SNAP_TAP_PAIRS: readonly [string, number[]][] = [
  ["A + D", [4, 7]],
  ["W + S", [26, 22]],
];

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  return left.every((id, index) => id === right[index]);
}

function DeckTravelReadout({
  bus,
  layout,
  live,
  unitMm,
  label,
}: {
  bus: TravelBus;
  layout: KeyDef[];
  live: boolean;
  unitMm: string;
  label: string;
}) {
  const sensors = useTravel(bus, live);
  const active = useMemo(() => {
    if (!live) return null;
    let keyLabel = "";
    let um = 0;
    for (const key of layout) {
      const sample = sensors[key.row * SENSOR_COLS + key.col] ?? 0;
      if (sample > um) {
        um = sample;
        keyLabel = key.label;
      }
    }
    return um > 50 ? { label: keyLabel, mm: um / 1000 } : null;
  }, [live, layout, sensors]);

  if (!live) return null;
  return (
    <span class={`deck__live${active ? " is-active" : ""}`}>
      {active ? `${active.label} · ${active.mm.toFixed(2)} ${unitMm}` : `${label}: —`}
    </span>
  );
}

export function App() {
  const store = useStore();
  const { state, lang, selection, selectedSet, travelBus, toasts, busy, link, run } = store;
  const [tab, setTab] = useState<TabId>("actuation");
  const [recording, setRecording] = useState(false);
  const [sensorsVisited, setSensorsVisited] = useState(false);
  const stream = useSensorStream(state?.connected ?? false);
  const failedWas = useRef(false);
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const t = STRINGS[lang];

  useEffect(() => {
    if (tab === "sensors") setSensorsVisited(true);
  }, [tab]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.inert = busy;
  }, [busy]);

  useEffect(() => {
    if (stream.failed && !failedWas.current) store.notify(t.sensorStreamError, "error");
    failedWas.current = stream.failed;
  }, [stream.failed, store.notify, t.sensorStreamError]);

  const showSensors = stream.live;

  const status = useMemo(() => {
    switch (link.state) {
      case "connecting":
        return { tone: "pending", text: t.linking };
      case "reconnecting":
        return { tone: "pending", text: t.reconnecting };
      case "online":
        return { tone: "online", text: t.connected };
      default:
        return { tone: "offline", text: link.detail ?? t.disconnected };
    }
  }, [link, t]);

  const toggleLang = () => store.setLang(lang === "ru" ? "en" : "ru");

  const onTabKeyDown = (e: KeyboardEvent) => {
    if (recording) return;
    const index = TABS.findIndex(([id]) => id === tab);
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (next != null) {
      e.preventDefault();
      const nextId = TABS[next]![0];
      setTab(nextId);
      tabRefs.current[nextId]?.focus();
    }
  };

  const offlineBanner =
    state && link.state === "offline" ? (
      <div class="offline-banner" role="alert">
        <span>
          <strong>{t.offlineBanner}.</strong> {link.detail ?? status.text}
        </span>
        <button type="button" class="btn" onClick={() => void store.reconnect()}>
          {t.reconnect}
        </button>
      </div>
    ) : null;

  return (
    <div class="app" data-busy={busy || undefined}>
      <header class="titlebar">
        <div class="titlebar__brand">
          <span class="titlebar__logo" aria-hidden="true" />
          <div>
            <h1>Aula WIN68 HE Pro</h1>
            <p>{t.appTitle}</p>
          </div>
        </div>

        <div class="titlebar__meta">
          <span class={`pill pill--${status.tone}`} title={status.text}>
            <span class="pill__dot" />
            <span class="pill__text">{status.text}</span>
          </span>
          {state?.firmware ? <span class="pill pill--ghost">FW {state.firmware}</span> : null}
          <button
            type="button"
            class="lang"
            onClick={toggleLang}
            aria-pressed={lang === "en"}
            title={t.language}
          >
            <span class={lang === "ru" ? "is-on" : ""}>RU</span>
            {" / "}
            <span class={lang === "en" ? "is-on" : ""}>EN</span>
          </button>
        </div>
      </header>

      <div class="workspace">
        <nav class="sidenav" role="tablist" aria-orientation="vertical" onKeyDown={onTabKeyDown}>
          {TABS.map(([id, labelKey]) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el;
              }}
              id={`tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              disabled={recording && id !== "sensors"}
              class={`navbtn${tab === id ? " is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              <NavIcon id={id} />
              <span>{t[labelKey]}</span>
            </button>
          ))}
        </nav>

        {state ? (
          <main class="stage">
            {KEY_TABS.has(tab) ? (
              <section class="deck">
                <Keyboard
                  layout={state.layout}
                  keys={state.keys}
                  selection={selectedSet}
                  travelBus={travelBus}
                  maxTravel={state.max_travel}
                  globalActuation={state.global_actuation}
                  snapTap={state.snap_tap}
                  modTap={state.mod_tap}
                  unitMm={t.unitMm}
                  showSensors={showSensors}
                  onKeyClick={store.toggleKey}
                  onSelectMany={store.selectMany}
                />
                <div class="deck__bar">
                  {PRESET_TABS.has(tab) ? (
                    <div class="deck__presets">
                      {state.presets.map(([name, preset]) => (
                        <Chip
                          key={name}
                          active={sameIds(selection, preset)}
                          onClick={() => store.selectMany(preset)}
                        >
                          {PRESET_LABELS[name]?.[lang === "ru" ? 0 : 1] ?? name}
                        </Chip>
                      ))}
                    </div>
                  ) : tab === "snaptap" ? (
                    <div class="deck__presets">
                      {SNAP_TAP_PAIRS.map(([label, pairIds]) => (
                        <Chip
                          key={label}
                          active={sameIds(selection, pairIds)}
                          onClick={() => store.selectMany(pairIds)}
                        >
                          {label}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <span class="deck__spacer" />
                  )}
                  <div class="deck__tools">
                    <DeckTravelReadout
                      bus={travelBus}
                      layout={state.layout}
                      live={stream.live}
                      unitMm={t.unitMm}
                      label={t.liveTravelReadout}
                    />
                    <span class="deck__count">
                      {selection.length} {t.selected}
                    </span>
                    <Button variant="ghost" disabled={selection.length === 0} onClick={store.clearSelection}>
                      {t.selectNone}
                    </Button>
                    <Toggle
                      label={t.liveTravel}
                      title={t.liveTravelHint}
                      checked={stream.live}
                      disabled={!state.connected || stream.pending || recording || busy}
                      onChange={stream.setStream}
                    />
                  </div>
                </div>
                <footer class="deck__legend">
                  <span class="legend">
                    <i class="legend__swatch legend__swatch--mark" /> {t.legendMark}
                  </span>
                  <span class="legend">
                    <i class="legend__swatch legend__swatch--global" /> {t.modeGlobal}
                  </span>
                  <span class="legend">
                    <i class="legend__swatch legend__swatch--single" /> {t.modeSingle}
                  </span>
                  <span class="legend">
                    <i class="legend__swatch legend__swatch--rapid" /> {t.modeRapid}
                  </span>
                  {stream.live ? (
                    <span class="legend">
                      <i class="legend__swatch legend__swatch--fired" /> {t.legendFired}
                    </span>
                  ) : null}
                  {state.snap_tap ? (
                    <span class="legend">
                      <i class="legend__swatch legend__swatch--snaptap" /> {t.legendSnapTap}
                    </span>
                  ) : null}
                  {state.mod_tap.length > 0 ? (
                    <span class="legend">
                      <i class="legend__swatch legend__swatch--modtap" /> {t.legendModTap}
                    </span>
                  ) : null}
                  <span class="deck__hint">{t.deckHint}</span>
                </footer>
              </section>
            ) : null}

            <div class="inspector">
              {offlineBanner}
              <div
                ref={contentRef}
                class="content"
                role="tabpanel"
                id={`panel-${tab}`}
                aria-labelledby={`tab-${tab}`}
              >
                {tab === "actuation" ? (
                  <ActuationTab state={state} lang={lang} selection={selection} run={run} />
                ) : null}
                {tab === "rapid" ? (
                  <RapidTab state={state} lang={lang} selection={selection} run={run} />
                ) : null}
                {tab === "snaptap" ? (
                  <SnapTapTab state={state} lang={lang} selection={selection} run={run} />
                ) : null}
                {tab === "modtap" ? (
                  <ModTapTab
                    state={state}
                    lang={lang}
                    selection={selection}
                    run={run}
                    onSelectKey={(id) => store.selectMany([id])}
                  />
                ) : null}
                {tab === "lighting" ? <LightingTab state={state} lang={lang} run={run} /> : null}
                {sensorsVisited ? (
                  <div hidden={tab !== "sensors"}>
                    <SensorsTab
                      state={state}
                      lang={lang}
                      travelBus={travelBus}
                      selection={selection}
                      selectMany={store.selectMany}
                      recording={recording}
                      setRecording={setRecording}
                      active={tab === "sensors"}
                      live={stream.live}
                      streamPending={stream.pending}
                      streamError={stream.failed}
                      setStream={stream.setStream}
                      stopStream={stream.stopStream}
                      onTune={(id, target) => {
                        store.selectMany([id]);
                        setTab(target);
                      }}
                    />
                  </div>
                ) : null}
                {tab === "system" ? (
                  <SystemTab state={state} lang={lang} run={run} notify={store.notify} />
                ) : null}
              </div>
            </div>
          </main>
        ) : (
          <main class="main main--boot">
            <div class="boot">
              {link.state === "offline" ? (
                <>
                  <p>{t.offlineBanner}</p>
                  <p class="note">{link.detail ?? t.disconnected}</p>
                </>
              ) : (
                <>
                  <span class="boot__spinner" />
                  <p>{t.linking}</p>
                </>
              )}
              <button type="button" class="btn" onClick={() => void store.reconnect()}>
                {t.reconnect}
              </button>
            </div>
          </main>
        )}
      </div>

      <div class="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} class={`toast toast--${toast.tone}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function NavIcon({ id }: { id: TabId }) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg class="navbtn__icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      {id === "actuation" ? (
        <>
          <path {...stroke} d="M4 20h16" />
          <path {...stroke} d="M7 20V10M12 20V5M17 20v-7" />
        </>
      ) : null}
      {id === "rapid" ? <path {...stroke} d="M13 2 4 14h7l-1 8 10-12h-7l0-8z" /> : null}
      {id === "snaptap" ? (
        <>
          <path {...stroke} d="M8 7 3 12l5 5" />
          <path {...stroke} d="M16 7l5 5-5 5" />
        </>
      ) : null}
      {id === "modtap" ? (
        <>
          <circle {...stroke} cx="12" cy="12" r="8" />
          <path {...stroke} d="M12 8v5l3 2" />
        </>
      ) : null}
      {id === "lighting" ? (
        <>
          <path {...stroke} d="M9 18h6M10 21h4" />
          <path {...stroke} d="M12 3a6 6 0 0 0-3 11c.6.6 1 1.4 1 2h4c0-.6.4-1.4 1-2a6 6 0 0 0-3-11z" />
        </>
      ) : null}
      {id === "sensors" ? <path {...stroke} d="M3 12h3l2-5 4 10 2-5h7" /> : null}
      {id === "system" ? (
        <>
          <path {...stroke} d="M4 7h16M4 12h10M4 17h16" />
          <circle {...stroke} cx="16" cy="12" r="1.5" />
        </>
      ) : null}
    </svg>
  );
}

export type { Lang };
