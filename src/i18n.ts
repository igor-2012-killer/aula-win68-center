export type Lang = "ru" | "en";

interface Strings {
  appTitle: string;
  connected: string;
  disconnected: string;
  reconnect: string;
  offlineBanner: string;

  navActuation: string;
  navRapid: string;
  navSnapTap: string;
  navModTap: string;
  navLighting: string;
  navSensors: string;
  navSystem: string;

  snapTapTitle: string;
  snapTapHint: string;
  snapTapActive: string;
  snapTapFirstKey: string;
  snapTapSecondKey: string;
  snapTapResolverMode: string;
  snapTapModeLastWon: string;
  snapTapModeFirst: string;
  snapTapModeSecond: string;
  snapTapModeNeutral: string;
  snapTapDelay: string;
  snapTapSave: string;
  snapTapDisable: string;
  snapTapNeedsTwoKeys: string;
  snapTapNote: string;
  snapTapModeWarning: string;

  modTapTitle: string;
  modTapHint: string;
  modTapHold: string;
  modTapTap: string;
  modTapDelay: string;
  modTapApply: string;
  modTapClear: string;
  modTapScan: string;
  modTapNoneSelected: string;
  modTapNotAssigned: string;
  modTapAssigned: string;
  modTapNoOutput: string;
  modTapNote: string;
  modTapClearNote: string;

  selection: string;
  selectNone: string;
  selected: string;
  key: string;
  noKeysSelected: string;
  mode: string;
  modeGlobal: string;
  modeSingle: string;
  modeRapid: string;

  globalActuation: string;
  globalActuationHint: string;
  selectedActuation: string;
  applyAll: string;
  applySelected: string;
  resetSelected: string;
  resetAll: string;
  resetAllConfirm: string;
  keyboardRangeNote: (min: string, max: string, step: string) => string;

  rapidTrigger: string;
  rapidHint: string;
  rapidNote: string;
  sensitivity: string;
  enabledForSelection: string;
  disabledForSelection: string;
  pressSensitivity: string;
  releaseSensitivity: string;
  enableOnSelected: string;
  disableOnSelected: string;
  quickPresets: string;
  quickPresetsHint: string;

  deadzone: string;
  deadzoneHint: string;
  deadzoneNote: string;
  pressDeadzone: string;
  releaseDeadzone: string;
  applyDeadzone: string;

  lighting: string;
  effect: string;
  effectName: string;
  brightness: string;
  speed: string;
  direction: string;
  directionLeft: string;
  directionRight: string;
  sleepTimer: string;
  palette: string;
  paletteHint: string;
  powered: string;
  superResponse: string;
  superResponseHint: string;
  /** Lighting effect names, indexed by effect id 0..20. */
  effectNames: readonly string[];
  /** Sleep timer labels, keyed by minutes. */
  sleepLabels: Readonly<Record<number, string>>;

  sensors: string;
  sensorsHint: string;
  sensorsIdle: string;
  streaming: string;
  streamingHint: string;
  activeSensors: string;
  channels: string;
  peak: string;
  peakReset: string;
  readout: string;
  on: string;
  off: string;

  system: string;
  pollingRate: string;
  pollingHint: string;
  reconnecting: string;
  profile: string;
  profileHint: string;
  profileUnit: string;
  profileNote: string;
  layout: string;
  layoutHint: string;
  device: string;
  firmware: string;
  range: string;
  step: string;
  reload: string;

  configTitle: string;
  configHint: string;
  configNote: string;
  exportConfig: string;
  importConfig: string;
  importInvalid: string;
  importDone: string;

  language: string;
  linking: string;
  deckHint: string;
}

const ru: Strings = {
  appTitle: "Панель управления",
  connected: "Подключена",
  disconnected: "Не найдена",
  reconnect: "Переподключить",
  offlineBanner: "Клавиатура не подключена",

  navActuation: "Срабатывание",
  navRapid: "Rapid Trigger",
  navSnapTap: "Snap Tap",
  navModTap: "Mod-Tap",
  navLighting: "Подсветка",
  navSensors: "Датчики",
  navSystem: "Система",

  snapTapTitle: "Snap Tap",
  snapTapHint: "Пока обе клавиши зажаты, резолвер решает, какая из них печатает",
  snapTapActive: "Snap Tap настроен",
  snapTapFirstKey: "Первая клавиша",
  snapTapSecondKey: "Вторая клавиша",
  snapTapResolverMode: "Режим резолвера",
  snapTapModeLastWon: "Последнее нажатие побеждает",
  snapTapModeFirst: "Приоритет первой клавиши",
  snapTapModeSecond: "Приоритет второй клавиши",
  snapTapModeNeutral: "Нейтральный: обе зажаты — тишина",
  snapTapDelay: "Задержка",
  snapTapSave: "Применить",
  snapTapDisable: "Выключить Snap Tap",
  snapTapNeedsTwoKeys: "Выберите две разные клавиши в схеме выше",
  snapTapNote:
    "Семантика снята с драйвера производителя кадр-в-кадр и подтверждена нажатиями на клавиатуре. Пороги резолвера (DKSV) в рабочем потоке всегда нулевые — интерфейс их не показывает. Кадры для всех четырёх режимов закреплены тестами.",
  snapTapModeWarning:
    "Запись пары переводит обе клавиши в режим расширенной клавиши. Выключение возвращает их режимы как были.",

  modTapTitle: "Mod-Tap",
  modTapHint: "Короткое нажатие выдаёт одну клавишу, удержание дольше порога — другую",
  modTapHold: "Клавиша удержания",
  modTapTap: "Клавиша тапа",
  modTapDelay: "Порог удержания",
  modTapApply: "Применить",
  modTapClear: "Убрать назначение",
  modTapScan: "Найти назначения на клавиатуре",
  modTapNoneSelected: "Выберите клавишу на схеме сверху",
  modTapNotAssigned: "Назначения нет",
  modTapAssigned: "Текущие назначения",
  modTapNoOutput: "— не задано —",
  modTapNote:
    "Семантика подтверждена кадрами драйвера производителя и проверена на клавиатуре: первый слот — вывод при удержании, второй — при коротком нажатии. Порог хранится в прошивке шагами по 10 мс. Назначение переводит клавишу в режим расширенной клавиши.",
  modTapClearNote:
    "Сброс убирает назначение и снимает флаг расширенной клавиши, сохраняя обычный режим клавиши.",

  selection: "Выбор клавиш",
  selectNone: "Снять всё",
  selected: "выбрано",
  key: "Клавиша",
  noKeysSelected: "Клавиши не выбраны",
  mode: "Режим",
  modeGlobal: "Глобальный",
  modeSingle: "Своя точка",
  modeRapid: "Rapid Trigger",

  globalActuation: "Общая точка срабатывания",
  globalActuationHint: "Значение для всех клавиш в глобальном режиме",
  selectedActuation: "Точка срабатывания выбранных",
  applyAll: "Применить ко всем",
  applySelected: "Применить к выбранным",
  resetSelected: "Вернуть к глобальной",
  resetAll: "Сбросить все клавиши",
  resetAllConfirm: "Сбросить все 68 клавиш к глобальному режиму?",
  keyboardRangeNote: (min, max, step) =>
    `Диапазон клавиатуры: ${min} – ${max} мм, шаг ${step} мм`,

  rapidTrigger: "Rapid Trigger",
  rapidHint: "Мгновенный отпуск при обратном ходе пальца",
  rapidNote:
    "Rapid Trigger задаётся на конкретные клавиши — выберите их на схеме сверху.",
  sensitivity: "Чувствительность",
  enabledForSelection: "Rapid Trigger включён для выбранных",
  disabledForSelection: "Rapid Trigger выключен для выбранных",
  pressSensitivity: "Чувствительность нажатия",
  releaseSensitivity: "Чувствительность отпускания",
  enableOnSelected: "Включить на выбранных",
  disableOnSelected: "Выключить на выбранных",
  quickPresets: "Готовые пресеты",
  quickPresetsHint: "Типичные значения для популярных игр",

  deadzone: "Мёртвые зоны",
  deadzoneHint: "Фильтр микровибраций по выбранным клавишам",
  deadzoneNote:
    "Глобальные мёртвые зоны в прошивке 9.1 доступны только для чтения, поэтому применяются к выбранным клавишам.",
  pressDeadzone: "Зона нажатия",
  releaseDeadzone: "Зона отпускания",
  applyDeadzone: "Применить мёртвые зоны",

  lighting: "Подсветка",
  effect: "Режим",
  effectName: "Эффект",
  brightness: "Яркость",
  speed: "Скорость",
  direction: "Направление",
  directionLeft: "Слева направо",
  directionRight: "Справа налево",
  sleepTimer: "Таймер отключения",
  palette: "Палитра",
  paletteHint: "Семь цветов, которые использует эффект",
  powered: "Подсветка включена",

  superResponse: "Super Response",
  superResponseHint: "Повышенное разрешение датчиков 0.02 мм",

  effectNames: [
    "Статичный",
    "Радуга",
    "Дыхание",
    "Реактивный",
    "Волна",
    "Рябь",
    "Спектр",
    "Бегущая строка",
    "Радужная волна",
    "Ambient",
    "Искры",
    "Звёздный свет",
    "Градиент",
    "Пульс",
    "Цикл",
    "Поиск",
    "Undertow",
    "Мороз",
    "Огонь",
    "Аврора",
    "Океан",
  ],
  sleepLabels: {
    0: "Никогда",
    1: "1 мин",
    3: "3 мин",
    5: "5 мин",
    10: "10 мин",
    15: "15 мин",
    30: "30 мин",
    60: "60 мин",
  },

  sensors: "Мониторинг датчиков",
  sensorsHint: "Живое значение хода штока по датчикам Холла",
  sensorsIdle: "Включите поток, чтобы увидеть ход штока в реальном времени.",
  streaming: "Поток данных",
  streamingHint: "Опрос матрицы датчиков 63 раз в секунду",
  activeSensors: "активных датчиков",
  channels: "каналов в матрице",
  peak: "Пик",
  peakReset: "Сбросить пики",
  readout: "Показания",
  on: "вкл",
  off: "выкл",

  system: "Система",
  pollingRate: "Частота опроса",
  pollingHint: "Смена частоты переподключает USB-интерфейс клавиатуры",
  reconnecting: "Клавиатура переподключается…",
  profile: "Профиль",
  profileHint: "Профили хранятся в памяти клавиатуры",
  profileUnit: "профиль",
  profileNote:
    "Каждый профиль хранит свои настройки срабатывания, Rapid Trigger и подсветки. Переключение профиля перезагружает их из памяти клавиатуры.",
  layout: "Раскладка",
  layoutHint: "Переключение профиля раскладки ОС",
  device: "Устройство",
  firmware: "Прошивка",
  range: "Диапазон хода",
  step: "Шаг",
  reload: "Перечитать настройки",

  configTitle: "Конфигурация",
  configHint: "Сохраните настройки в файл или загрузите их обратно",
  configNote:
    "В файл входят срабатывание, Rapid Trigger, мёртвые зоны, подсветка, частота опроса, профиль и раскладка ОС. Snap Tap и Mod-Tap не переносятся.",
  exportConfig: "Сохранить в файл",
  importConfig: "Загрузить из файла",
  importInvalid: "Файл не похож на конфигурацию этой панели",
  importDone: "Настройки применены",

  language: "Язык",
  linking: "Подключение…",
  deckHint: "Ctrl / Shift + клик — мультивыбор",
};

const en: Strings = {
  appTitle: "Control Panel",
  connected: "Connected",
  disconnected: "Not found",
  reconnect: "Reconnect",
  offlineBanner: "Keyboard not connected",

  navActuation: "Actuation",
  navRapid: "Rapid Trigger",
  navSnapTap: "Snap Tap",
  navModTap: "Mod-Tap",
  navLighting: "Lighting",
  navSensors: "Sensors",
  navSystem: "System",

  snapTapTitle: "Snap Tap",
  snapTapHint: "While both keys are held, the resolver decides which one types",
  snapTapActive: "Snap Tap configured",
  snapTapFirstKey: "First key",
  snapTapSecondKey: "Second key",
  snapTapResolverMode: "Resolver mode",
  snapTapModeLastWon: "Last key pressed wins",
  snapTapModeFirst: "First key wins",
  snapTapModeSecond: "Second key wins",
  snapTapModeNeutral: "Neutral: both held → silent",
  snapTapDelay: "Delay",
  snapTapSave: "Apply",
  snapTapDisable: "Disable Snap Tap",
  snapTapNeedsTwoKeys: "Pick two different keys in the diagram above",
  snapTapNote:
    "Semantics captured frame-for-frame from the vendor driver and confirmed by pressing keys on the board. The resolver thresholds (DKSV) are always zero in the working flow, so the UI does not expose them. All four mode frames are pinned by tests.",
  snapTapModeWarning:
    "Writing a pair flags both keys as advanced keys. Disabling restores the modes they had before.",

  modTapTitle: "Mod-Tap",
  modTapHint: "A short press outputs one key, holding past the threshold outputs another",
  modTapHold: "Hold output",
  modTapTap: "Tap output",
  modTapDelay: "Hold threshold",
  modTapApply: "Apply",
  modTapClear: "Remove assignment",
  modTapScan: "Find assignments on the keyboard",
  modTapNoneSelected: "Pick a key in the diagram above",
  modTapNotAssigned: "No assignment",
  modTapAssigned: "Current assignments",
  modTapNoOutput: "— none —",
  modTapNote:
    "Semantics confirmed against the vendor driver's own frames and on the board: the first slot is the hold output, the second is the tap output. The firmware stores the threshold in 10 ms steps. Assigning flags the key as an advanced key.",
  modTapClearNote:
    "Removing the assignment also clears the advanced-key flag and keeps the key's ordinary mode.",

  selection: "Key selection",
  selectNone: "Clear",
  selected: "selected",
  key: "Key",
  noKeysSelected: "No keys selected",
  mode: "Mode",
  modeGlobal: "Global",
  modeSingle: "Custom point",
  modeRapid: "Rapid Trigger",

  globalActuation: "Global actuation point",
  globalActuationHint: "Value used by every key in global mode",
  selectedActuation: "Selected keys actuation",
  applyAll: "Apply to all",
  applySelected: "Apply to selected",
  resetSelected: "Back to global",
  resetAll: "Reset every key",
  resetAllConfirm: "Reset all 68 keys to global mode?",
  keyboardRangeNote: (min, max, step) =>
    `Keyboard range: ${min} – ${max} mm, step ${step} mm`,

  rapidTrigger: "Rapid Trigger",
  rapidHint: "Instant reset when the finger reverses direction",
  rapidNote: "Rapid Trigger is configured per key — pick them in the diagram above.",
  sensitivity: "Sensitivity",
  enabledForSelection: "Rapid Trigger enabled for the selected keys",
  disabledForSelection: "Rapid Trigger disabled for the selected keys",
  pressSensitivity: "Press sensitivity",
  releaseSensitivity: "Release sensitivity",
  enableOnSelected: "Enable on selected",
  disableOnSelected: "Disable on selected",
  quickPresets: "Presets",
  quickPresetsHint: "Typical values for popular shooters",

  deadzone: "Deadzones",
  deadzoneHint: "Filters micro-vibrations on the selected keys",
  deadzoneNote:
    "Global deadzones are read-only on firmware 9.1, so they are written per key instead.",
  pressDeadzone: "Press deadzone",
  releaseDeadzone: "Release deadzone",
  applyDeadzone: "Apply deadzones",

  lighting: "Lighting",
  effect: "Mode",
  effectName: "Effect",
  brightness: "Brightness",
  speed: "Speed",
  direction: "Direction",
  directionLeft: "Left to right",
  directionRight: "Right to left",
  sleepTimer: "Sleep timer",
  palette: "Palette",
  paletteHint: "The seven colours the effect cycles through",
  powered: "Lighting enabled",
  superResponse: "Super Response",
  superResponseHint: "Elevated sensor resolution down to 0.02 mm",

  effectNames: [
    "Static",
    "Rainbow",
    "Breathing",
    "Reactive",
    "Wave",
    "Ripple",
    "Spectrum",
    "Marquee",
    "Rainbow Wave",
    "Ambient",
    "Spark",
    "Starlight",
    "Gradient",
    "Pulse",
    "Cycle",
    "Search",
    "Undertow",
    "Frost",
    "Fire",
    "Aurora",
    "Ocean",
  ],
  sleepLabels: {
    0: "Never",
    1: "1 min",
    3: "3 min",
    5: "5 min",
    10: "10 min",
    15: "15 min",
    30: "30 min",
    60: "60 min",
  },

  sensors: "Sensor monitor",
  sensorsHint: "Live stem travel measured by the Hall sensors",
  sensorsIdle: "Turn the stream on to watch the stems move in real time.",
  streaming: "Data stream",
  streamingHint: "Polls the sensor matrix about 63 times per second",
  activeSensors: "active sensors",
  channels: "channels in the matrix",
  peak: "Peak",
  peakReset: "Reset peaks",
  readout: "Readout",
  on: "ON",
  off: "OFF",

  system: "System",
  pollingRate: "Polling rate",
  pollingHint: "Changing the rate re-enumerates the keyboard USB interface",
  reconnecting: "Keyboard is reconnecting…",
  profile: "Profile",
  profileHint: "Profiles live in the keyboard's own memory",
  profileUnit: "profile",
  profileNote:
    "Each profile stores its own actuation, Rapid Trigger and lighting settings. Switching profiles reloads them from the keyboard.",
  layout: "Layout",
  layoutHint: "Switches the keyboard's OS layout profile",
  device: "Device",
  firmware: "Firmware",
  range: "Travel range",
  step: "Step",
  reload: "Reload settings",

  configTitle: "Configuration",
  configHint: "Save the settings to a file or load them back",
  configNote:
    "The file covers actuation, Rapid Trigger, deadzones, lighting, polling rate, profile and OS layout. Snap Tap and Mod-Tap assignments are not included.",
  exportConfig: "Export to file",
  importConfig: "Import from file",
  importInvalid: "That does not look like a configuration file from this panel",
  importDone: "Configuration applied",

  language: "Language",
  linking: "Connecting…",
  deckHint: "Ctrl / Shift + click to multi-select",
};

export const STRINGS: Record<Lang, Strings> = { ru, en };

export const PRESET_LABELS: Record<string, [string, string]> = {
  wasd: ["WASD", "WASD"],
  qwer: ["QWER", "QWER"],
  arrows: ["Стрелки", "Arrows"],
  digits: ["Цифры", "Digits"],
  letters: ["Буквы", "Letters"],
  modifiers: ["Модификаторы", "Modifiers"],
  all: ["Все", "All"],
};
