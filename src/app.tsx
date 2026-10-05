import { useEffect, useMemo, useState } from "preact/hooks";
import { STRINGS, type Lang } from "./i18n";
import { useStore } from "./store";
import { Keyboard } from "./components/Keyboard";
import { ActuationTab } from "./components/tabs/ActuationTab";
import { RapidTab } from "./components/tabs/RapidTab";
import { SnapTapTab } from "./components/tabs/SnapTapTab";
import { ModTapTab } from "./components/tabs/ModTapTab";
import { LightingTab } from "./components/tabs/LightingTab";
import { SensorsTab } from "./components/tabs/SensorsTab";
import { SystemTab } from "./components/tabs/SystemTab";

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

export function App() {
  const store = useStore();
  const { state, lang, selection, selectedSet, sensors, toasts, busy, link, run } = store;
  const [tab, setTab] = useState<TabId>("actuation");
  const [liveOverlay, setLiveOverlay] = useState(false);
  const t = STRINGS[lang];

  // The keyboard diagram shows the sensor overlay whenever the stream is on.
  useEffect(() => {
    setLiveOverlay(tab === "sensors");
  }, [tab]);

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
    const index = TABS.findIndex(([id]) => id === tab);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (index + 1) % TABS.length;
    if (e.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    if (next != null) {
      e.preventDefault();
      setTab(TABS[next]![0]);
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
          <span class={`pill pill--${status.tone}`}>
            <span class="pill__dot" />
            {status.text}
          </span>
          {state?.firmware ? <span class="pill pill--ghost">FW {state.firmware}</span> : null}
          <button
            type="button"
            class={`lang${lang === "en" ? " is-active" : ""}`}
            onClick={toggleLang}
            aria-pressed={lang === "en"}
            title={t.language}
          >
            RU / EN
          </button>
        </div>
      </header>

      <nav class="tabs" role="tablist" onKeyDown={onTabKeyDown}>
        {TABS.map(([id, labelKey]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            class={`tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {t[labelKey]}
          </button>
        ))}
      </nav>

      {state ? (
        <main class="main">
          {offlineBanner}
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
            {tab === "modtap" ? (
              <ModTapTab
                state={state}
                lang={lang}
                selection={selection}
                run={run}
                notify={store.notify}
              />
            ) : null}
            {tab === "lighting" ? <LightingTab state={state} lang={lang} run={run} /> : null}
            {tab === "sensors" ? <SensorsTab state={state} lang={lang} sensors={sensors} /> : null}
            {tab === "system" ? (
              <SystemTab state={state} lang={lang} run={run} notify={store.notify} />
            ) : null}
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

export type { Lang };
