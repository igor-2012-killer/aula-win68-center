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

  unitMm: string;
  unitMs: string;

  snapTapTitle: string;
  snapTapHint: string;
  snapTapStatusTitle: string;
  snapTapOff: string;
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
  snapTapReplaceHint: string;
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

  selectNone: string;
  selected: string;
  selectedKeysTitle: string;
  key: string;
  noKeysSelected: string;
  mode: string;
  modeGlobal: string;
  modeSingle: string;
  modeRapid: string;
  modeMixed: string;

  globalActuation: string;
  globalActuationHint: string;
  selectedActuation: string;
  resetSelected: string;
  resetAll: string;
  confirmResetAll: string;
  cancel: string;
  keyboardRangeNote: (min: string, max: string, step: string) => string;

  rapidTrigger: string;
  rapidHint: string;
  rapidNote: string;
  rapidSliderNote: string;
  sensitivity: string;
  enabledForSelection: string;
  disabledForSelection: string;
  mixedForSelection: string;
  pressSensitivity: string;
  releaseSensitivity: string;
  disableOnSelected: string;
  quickPresets: string;
  quickPresetsHint: string;

  deadzone: string;
  deadzoneHint: string;
  deadzoneNote: string;
  pressDeadzone: string;
  releaseDeadzone: string;

  lighting: string;
  effect: string;
  lightingNormal: string;
  lightingFill: string;
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
  sensorsSubMonitor: string;
  sensorsSubRecording: string;
  practiceTitle: string;
  practiceHint: string;
  practiceSteps: string;
  practiceSelect: string;
  practicePeak: string;
  practiceReset: string;
  practiceLive: string;
  practiceStart: string;
  practiceSelectZX: string;
  practiceAnyKeys: string;
  practiceMode: string;
  practiceActuation: string;
  practiceTuneActuation: string;
  practiceTuneRapid: string;
  practiceGuideTitle: string;
  practiceGuideHint: string;
  practiceGuideObserve: string;
  practiceGuideActuation: string;
  practiceGuideRapid: string;
  practiceGuideCompare: string;
  practiceGuideLimit: string;
  sensorsHint: string;
  sensorsIdle: string;
  streaming: string;
  streamingHint: string;
  sensorStreamError: string;
  activeSensors: string;
  channels: string;
  peak: string;
  peakReset: string;
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
  liveTravel: string;
  liveTravelHint: string;
  liveTravelReadout: string;
  legendMark: string;
  legendFired: string;
  legendSnapTap: string;
  legendModTap: string;
}

const ru: Strings = {
  practiceTitle: "Тренировка нажатий",
  practiceHint: "Посмотрите, как двигаются ваши игровые клавиши",
  practiceSteps: "Выберите клавиши на схеме, включите поток датчиков и сыграйте короткий отрывок. Сравните ход и пики, затем настройте срабатывание и Rapid Trigger по ощущениям. Это наблюдение, не калибровка датчиков.",
  practiceSelect: "Выберите игровые клавиши на схеме выше, например Z и X.",
  practicePeak: "Максимум",
  practiceReset: "Новая попытка",
  practiceLive: "Максимум сохраняется до новой попытки или смены выбора. Очень короткий пик может не попасть в кадр.",
  practiceStart: "Включите поток датчиков, чтобы начать.",
  practiceSelectZX: "Выбрать Z + X",
  practiceAnyKeys: "Или выберите любые клавиши на схеме.",
  practiceMode: "Режим",
  practiceActuation: "Срабатывание",
  practiceTuneActuation: "Срабатывание",
  practiceTuneRapid: "Rapid Trigger",
  practiceGuideTitle: "Подбор под себя",
  practiceGuideHint: "Настраивайте каждую клавишу по отдельности",
  practiceGuideObserve: "Включите поток и сыграйте привычный короткий рисунок. Повторите несколько раз, сравнивая Z и X; максимум показывает глубину, а не качество нажатий.",
  practiceGuideActuation: "Для обычного режима выберите срабатывание у нужной клавиши. Если лёгкие нажатия не регистрируются, попробуйте меньшую глубину; при случайных нажатиях — большую.",
  practiceGuideRapid: "Для Rapid Trigger меняйте чувствительность малыми шагами и проверяйте быстрые повторы. Если появляются лишние нажатия, попробуйте увеличить значения. Срабатывание и Rapid Trigger переключают режим клавиши: настройка одного может отключить другой.",
  practiceGuideCompare: "После каждого изменения сыграйте тот же отрывок и оцените пропуски, лишние нажатия и комфорт. Повторите отдельно для второй клавиши.",
  practiceGuideLimit: "Показания датчиков не фиксируют игровые события и не определяют оптимальные значения автоматически. До экспериментов можно экспортировать конфигурацию во вкладке «Система»; Snap Tap и Mod-Tap в экспорт не входят.",
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

  unitMm: "мм",
  unitMs: "мс",

  snapTapTitle: "Snap Tap",
  snapTapHint: "Пока обе клавиши зажаты, резолвер решает, какая из них печатает",
  snapTapStatusTitle: "Текущая пара",
  snapTapOff: "Snap Tap выключен.",
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
  snapTapNeedsTwoKeys: "Выберите две разные клавиши на схеме выше",
  snapTapReplaceHint: "Выберите две клавиши на схеме, чтобы задать или заменить пару.",
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

  selectNone: "Снять всё",
  selected: "выбрано",
  selectedKeysTitle: "Выбранные клавиши",
  key: "Клавиша",
  noKeysSelected: "Клавиши не выбраны",
  mode: "Режим",
  modeGlobal: "Глобальный",
  modeSingle: "Своя точка",
  modeRapid: "Rapid Trigger",
  modeMixed: "Смешанный",

  globalActuation: "Общая точка срабатывания",
  globalActuationHint: "Значение для всех клавиш в глобальном режиме",
  selectedActuation: "Точка срабатывания выбранных",
  resetSelected: "Вернуть к глобальной",
  resetAll: "Сбросить все клавиши",
  confirmResetAll: "Подтвердить сброс",
  cancel: "Отмена",
  keyboardRangeNote: (min, max, step) =>
    `Диапазон клавиатуры: ${min} – ${max} мм, шаг ${step} мм`,

  rapidTrigger: "Rapid Trigger",
  rapidHint: "Мгновенный отпуск при обратном ходе пальца",
  rapidNote:
    "Rapid Trigger задаётся на конкретные клавиши — выберите их на схеме сверху.",
  rapidSliderNote:
    "Изменение чувствительности включает Rapid Trigger на выбранных клавишах и заменяет режим обычного срабатывания.",
  sensitivity: "Чувствительность",
  enabledForSelection: "Rapid Trigger включён для выбранных",
  disabledForSelection: "Rapid Trigger выключен для выбранных",
  mixedForSelection: "Rapid Trigger включён на части клавиш",
  pressSensitivity: "Чувствительность нажатия",
  releaseSensitivity: "Чувствительность отпускания",
  disableOnSelected: "Выключить на выбранных",
  quickPresets: "Готовые пресеты",
  quickPresetsHint: "Типичные значения для популярных игр",

  deadzone: "Мёртвые зоны",
  deadzoneHint: "Фильтр микровибраций по выбранным клавишам",
  deadzoneNote:
    "Глобальные мёртвые зоны в прошивке 9.1 доступны только для чтения, поэтому применяются к выбранным клавишам.",
  pressDeadzone: "Зона нажатия",
  releaseDeadzone: "Зона отпускания",

  lighting: "Подсветка",
  effect: "Режим",
  lightingNormal: "Обычный",
  lightingFill: "Заливка",
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
  sensorsSubMonitor: "Мониторинг",
  sensorsSubRecording: "Запись и osu!",
  sensorsHint: "Живое значение хода штока по датчикам Холла",
  sensorsIdle: "Включите поток, чтобы увидеть ход штока в реальном времени.",
  streaming: "Поток данных",
  streamingHint: "Опрос матрицы датчиков 63 раза в секунду",
  sensorStreamError: "Не удалось переключить поток датчиков. Проверьте подключение клавиатуры и попробуйте снова.",
  activeSensors: "активных датчиков",
  channels: "каналов в матрице",
  peak: "Пик",
  peakReset: "Сбросить пики",
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
  deckHint: "Клик или протаскивание выбирает клавиши. Ctrl / Shift + клик — добавить",
  liveTravel: "Ход на клавишах",
  liveTravelHint: "Глубина нажатия прямо на схеме. Это тот же поток, что на вкладке «Датчики».",
  liveTravelReadout: "Ход",
  legendMark: "Точка срабатывания",
  legendFired: "Сработала",
  legendSnapTap: "Snap Tap",
  legendModTap: "Mod-Tap",
};

const en: Strings = {
  practiceTitle: "Keystroke practice",
  practiceHint: "See how your game keys move",
  practiceSteps: "Select keys on the diagram, enable the sensor stream and play a short passage. Compare travel and peaks, then adjust actuation and Rapid Trigger to feel. This is observation, not sensor calibration.",
  practiceSelect: "Select your game keys on the diagram above, for example Z and X.",
  practicePeak: "Peak",
  practiceReset: "New attempt",
  practiceLive: "Peaks are retained until a new attempt or selection change. Very short peaks may be missed.",
  practiceStart: "Enable the sensor stream to begin.",
  practiceSelectZX: "Select Z + X",
  practiceAnyKeys: "Or select any keys on the diagram.",
  practiceMode: "Mode",
  practiceActuation: "Actuation",
  practiceTuneActuation: "Actuation",
  practiceTuneRapid: "Rapid Trigger",
  practiceGuideTitle: "Tune to your playing",
  practiceGuideHint: "Adjust each key individually",
  practiceGuideObserve: "Start the stream and play a familiar short pattern. Repeat and compare Z and X; the peak shows depth, not the quality of a press.",
  practiceGuideActuation: "For normal mode, choose actuation for one key. If light presses do not register, try a lower depth; for accidental presses, try a higher one.",
  practiceGuideRapid: "For Rapid Trigger, change sensitivity in small steps and test fast repetitions. If extra presses occur, try higher values. Actuation and Rapid Trigger change the key mode: adjusting one can disable the other.",
  practiceGuideCompare: "After each change, play the same passage and assess misses, extra presses and comfort. Repeat for the other key.",
  practiceGuideLimit: "Sensor readings do not capture game events or automatically determine optimal values. You can export your configuration from System before experimenting; Snap Tap and Mod-Tap are not included.",
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

  unitMm: "mm",
  unitMs: "ms",

  snapTapTitle: "Snap Tap",
  snapTapHint: "While both keys are held, the resolver decides which one types",
  snapTapStatusTitle: "Active pair",
  snapTapOff: "Snap Tap is off.",
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
  snapTapReplaceHint: "Select two keys on the diagram to set or replace the pair.",
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

  selectNone: "Clear",
  selected: "selected",
  selectedKeysTitle: "Selected keys",
  key: "Key",
  noKeysSelected: "No keys selected",
  mode: "Mode",
  modeGlobal: "Global",
  modeSingle: "Custom point",
  modeRapid: "Rapid Trigger",
  modeMixed: "Mixed",

  globalActuation: "Global actuation point",
  globalActuationHint: "Value used by every key in global mode",
  selectedActuation: "Selected keys actuation",
  resetSelected: "Back to global",
  resetAll: "Reset every key",
  confirmResetAll: "Confirm reset",
  cancel: "Cancel",
  keyboardRangeNote: (min, max, step) =>
    `Keyboard range: ${min} – ${max} mm, step ${step} mm`,

  rapidTrigger: "Rapid Trigger",
  rapidHint: "Instant reset when the finger reverses direction",
  rapidNote: "Rapid Trigger is configured per key — pick them in the diagram above.",
  rapidSliderNote: "Adjusting sensitivity enables Rapid Trigger on selected keys, replacing normal actuation mode.",
  sensitivity: "Sensitivity",
  enabledForSelection: "Rapid Trigger enabled for the selected keys",
  disabledForSelection: "Rapid Trigger disabled for the selected keys",
  mixedForSelection: "Rapid Trigger enabled on some keys",
  pressSensitivity: "Press sensitivity",
  releaseSensitivity: "Release sensitivity",
  disableOnSelected: "Disable on selected",
  quickPresets: "Presets",
  quickPresetsHint: "Typical values for popular shooters",

  deadzone: "Deadzones",
  deadzoneHint: "Filters micro-vibrations on the selected keys",
  deadzoneNote:
    "Global deadzones are read-only on firmware 9.1, so they are written per key instead.",
  pressDeadzone: "Press deadzone",
  releaseDeadzone: "Release deadzone",

  lighting: "Lighting",
  effect: "Mode",
  lightingNormal: "Normal",
  lightingFill: "Fill",
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
  sensorsSubMonitor: "Monitor",
  sensorsSubRecording: "Recording & osu!",
  sensorsHint: "Live stem travel measured by the Hall sensors",
  sensorsIdle: "Turn the stream on to watch the stems move in real time.",
  streaming: "Data stream",
  streamingHint: "Polls the sensor matrix about 63 times per second",
  sensorStreamError: "Could not change the sensor stream. Check the keyboard connection and try again.",
  activeSensors: "active sensors",
  channels: "channels in the matrix",
  peak: "Peak",
  peakReset: "Reset peaks",
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
  deckHint: "Click or drag to select keys. Ctrl / Shift + click adds",
  liveTravel: "Key travel",
  liveTravelHint: "Press depth drawn on the keys. This is the same stream as the Sensors tab.",
  liveTravelReadout: "Travel",
  legendMark: "Actuation point",
  legendFired: "Actuated",
  legendSnapTap: "Snap Tap",
  legendModTap: "Mod-Tap",
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
