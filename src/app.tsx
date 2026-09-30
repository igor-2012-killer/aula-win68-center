import { useEffect, useMemo, useState } from "preact/hooks";
import { STRINGS, type Lang } from "./i18n";
import { api } from "./ipc";
import { useStore } from "./store";
import { Keyboard } from "./components/Keyboard";
import { ActuationTab } from "./components/tabs/ActuationTab";
import { RapidTab } from "./components/tabs/RapidTab";
import { SnapTapTab } from "./components/tabs/SnapTapTab";
import { LightingTab } from "./components/tabs/LightingTab";
import { SensorsTab } from "./components/tabs/SensorsTab";
import { SystemTab } from "./components/tabs/SystemTab";

type TabId = "actuation" | "rapid" | "snaptap" | "lighting" | "sensors" | "system";

type NavKey =
  | "navActuation"
  | "navRapid"
  | "navSnapTap"
  | "navLighting"
  | "navSensors"
  | "navSystem";

const TABS: [TabId, NavKey][] = [
  ["actuation", "navActuation"],
  ["rapid", "navRapid"],
  ["snaptap", "navSnapTap"],
  ["lighting", "navLighting"],
  ["sensors", "navSensors"],
  ["system", "navSystem"],
];

export function App() {
  const store = useStore();
  const { state, lang, selection, selectedSet, sensors, toasts, busy, run } = store;
  const [tab, setTab] = useState<TabId>("actuation");
  const [liveOverlay, setLiveOverlay] = useState(false);
  const t = STRINGS[lang];

  // The keyboard diagram shows the sensor overlay whenever the stream is on.
  useEffect(() => {
    setLiveOverlay(tab === "sensors");
  }, [tab]);

  const status = useMemo(() => {
    if (!state) return { tone: "pending", text: t.linking };
    if (state.reconnecting) return { tone: "pending", text: t.reconnecting };
    if (state.connected) return { tone: "online", text: t.connected };
    return { tone: "offline", text: state.last_error ?? t.disconnected };
  }, [state, t]);

  const toggleLang = () => store.setLang(lang === "ru" ? "en" : "ru");

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
          <span class={`pill pill--${status.tone}`}>
            <span class="pill__dot" />
            {status.text}
          </span>
          {state?.firmware ? <span class="pill pill--ghost">FW {state.firmware}</span> : null}
          <button
            type="button"
            class={`lang${lang === "en" ? " is-active" : ""}`}
            onClick={toggleLang}
            title={t.language}
          >
            RU / EN
          </button>
        </div>
      </header>

      <nav class="tabs">
        {TABS.map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            class={`tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {t[labelKey]}
          </button>
        ))}
      </nav>

      {state ? (
        <main class="main">
          <section class="deck">
            <Keyboard
              layout={state.layout}
              keys={state.keys}
              selection={selectedSet}
              sensors={sensors}
              maxTravel={state.max_travel}
              showSensors={liveOverlay}
              onKeyClick={store.toggleKey}
            />
            <footer class="deck__legend">
              <span class="legend">
                <i class="legend__swatch legend__swatch--global" /> {t.modeGlobal}
              </span>
              <span class="legend">
                <i class="legend__swatch legend__swatch--single" /> {t.modeSingle}
              </span>
              <span class="legend">
                <i class="legend__swatch legend__swatch--rapid" /> {t.modeRapid}
              </span>
              <span class="deck__hint">{t.deckHint}</span>
            </footer>
          </section>

          <div class="content">
            {tab === "actuation" ? (
              <ActuationTab
                state={state}
                lang={lang}
                selection={selection}
                notify={store.notify}
                run={run}
                selectMany={store.selectMany}
                clearSelection={store.clearSelection}
              />
            ) : null}
            {tab === "rapid" ? (
              <RapidTab state={state} lang={lang} selection={selection} run={run} />
            ) : null}
            {tab === "snaptap" ? (
        <SnapTapTab state={state} lang={lang} selection={selection} run={run} />
      ) : null}
      {tab === "lighting" ? <LightingTab state={state} lang={lang} run={run} /> : null}
            {tab === "sensors" ? <SensorsTab state={state} lang={lang} sensors={sensors} /> : null}
            {tab === "system" ? <SystemTab state={state} lang={lang} run={run} /> : null}
          </div>
        </main>
      ) : (
        <main class="main main--boot">
          <div class="boot">
            <span class="boot__spinner" />
            <p>{t.linking}</p>
            <button type="button" class="btn" onClick={() => void api.reconnect()}>
              {t.reconnect}
            </button>
          </div>
        </main>
      )}

      <div class="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} class={`toast toast--${toast.tone}`}>
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { Lang };
