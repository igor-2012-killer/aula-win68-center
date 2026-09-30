export type Lang = "ru" | "en";

interface Strings {
  appTitle: string;
  connected: string;
  connecting: string;
  disconnected: string;
  reconnect: string;

  navActuation: string;
  navRapid: string;
  navLighting: string;
  navSensors: string;
  navSystem: string;

  selection: string;
  selectNone: string;
  selected: string;
  key: string;
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

  delay: string;

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

  sensors: string;
  sensorsHint: string;
  sensorsIdle: string;
  streaming: string;
  streamingHint: string;
  activeSensors: string;
  channels: string;
  peak: string;
  readout: string;


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


  saved: string;
  failed: string;
  language: string;
  linking: string;
  deckHint: string;
}

const ru: Strings = {
  appTitle: "Панель управления",
  connected: "Подключена",
  connecting: "Подключение…",
  disconnected: "Не найдена",
  reconnect: "Переподключить",

  navActuation: "Срабатывание",
  navRapid: "Rapid Trigger",
  navLighting: "Подсветка",
  navSensors: "Датчики",
  navSystem: "Система",

  selection: "Выбор клавиш",
  selectNone: "Снять всё",
  selected: "выбрано",
  key: "Клавиша",
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

  delay: "Задержка сброса",

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

  sensors: "Мониторинг датчиков",
  sensorsHint: "Живое значение хода штока по датчикам Холла",
  sensorsIdle: "Включите поток, чтобы увидеть ход штока в реальном времени.",
  streaming: "Поток данных",
  streamingHint: "Опрос матрицы датчиков 63 раз в секунду",
  activeSensors: "активных датчиков",
  channels: "каналов в матрице",
  peak: "Пик",
  readout: "Показания",


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


  saved: "Сохранено",
  failed: "Ошибка",
  language: "Язык",
  linking: "Подключение…",
  deckHint: "Ctrl / Shift + клик — мультивыбор",
};

const en: Strings = {
  appTitle: "Control Panel",
  connected: "Connected",
  connecting: "Connecting…",
  disconnected: "Not found",
  reconnect: "Reconnect",

  navActuation: "Actuation",
  navRapid: "Rapid Trigger",
  navLighting: "Lighting",
  navSensors: "Sensors",
  navSystem: "System",

  selection: "Key selection",
  selectNone: "Clear",
  selected: "selected",
  key: "Key",
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

  delay: "Задержка сброса",

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

  sensors: "Sensor monitor",
  sensorsHint: "Live stem travel measured by the Hall sensors",
  sensorsIdle: "Turn the stream on to watch the stems move in real time.",
  streaming: "Data stream",
  streamingHint: "Polls the sensor matrix about 63 times per second",
  activeSensors: "active sensors",
  channels: "channels in the matrix",
  peak: "Peak",
  readout: "Readout",


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


  saved: "Saved",
  failed: "Error",
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
