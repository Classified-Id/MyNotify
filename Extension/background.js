/**
 * MyNotify — background service worker (Manifest V3).
 *
 * Зоны ответственности:
 *   1. инициализация локального хранилища;
 *   2. постановка chrome.alarms на каждое включённое напоминание;
 *   3. показ уведомлений + звук через offscreen document;
 *   4. периодический бэкап напоминаний в chrome.storage.sync.
 *
 * Service worker «засыпает» и просыпается — поэтому никакого состояния
 * в памяти, кроме флага инициализации, не храним: всё живёт в storage и alarms.
 */

const OFFSCREEN_PATH = 'offscreen.html';
const ICON_URL = 'icons/icon48.png';

const REMINDER_ALARM_PREFIX = 'reminder_';
const BACKUP_ALARM = 'backupAlarm';
const BACKUP_INTERVAL_MIN = 5;

let isInitialized = false;

// ==================== ХРАНИЛИЩЕ ====================

/** Всегда возвращает массив напоминаний (пустой, если данных нет/они битые). */
async function getReminders() {
  const { reminders } = await chrome.storage.local.get('reminders');
  return Array.isArray(reminders) ? reminders : [];
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

async function initializeApp() {
  if (isInitialized) return;
  isInitialized = true;

  const { reminders } = await chrome.storage.local.get('reminders');

  // Первый запуск (или данные повреждены) — заводим пустое хранилище
  if (!Array.isArray(reminders)) {
    await chrome.storage.local.set({ reminders: [], appInitialized: true });
  }

  await scheduleAllReminders();
}

// ==================== OFFSРEEN: ЗВУК ====================

/** Создаёт offscreen document, если его ещё нет (нужен для Audio API в MV3). */
async function ensureOffscreenDocument() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });

  if (contexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Воспроизведение звука напоминаний',
  });
}

/**
 * Проиграть звук напоминания.
 * @param {string | null} soundFile - имя mp3 из sounds/; null → стандартный бип
 */
async function playReminderSound(soundFile) {
  try {
    await ensureOffscreenDocument();
    await chrome.runtime.sendMessage({ action: 'playSound', soundFile });
  } catch {
    // offscreen ещё не готов или умер — уведомление важнее звука, молчим
  }
}

/**
 * Заглушить текущий звук (offscreen сам остановит mp3 или бип).
 * Молча игнорируем любые ошибки: offscreen может быть ещё не создан/уже закрыт.
 */
function stopReminderSound() {
  try {
    chrome.runtime.sendMessage({ action: 'stopSound' })?.catch?.(() => {});
  } catch {
    // нет получателя — глушить нечего
  }
}

// ==================== РАСПИСАНИЕ ====================

/**
 * Пересоздаёт все алармы под текущий список напоминаний.
 * clearAll() удаляет и бэкап-аларм, поэтому сразу восстанавливаем его.
 */
async function scheduleAllReminders() {
  const reminders = await getReminders();

  await chrome.alarms.clearAll();
  reminders.filter((reminder) => reminder.enabled).forEach(scheduleReminder);
  await ensureBackupAlarm();
}

/**
 * Ставит одноразовый аларм на ближайшее срабатывание напоминания.
 * Одноразовый, а не периодический: после срабатывания ставим следующий заново,
 * иначе при переходе на летнее/зимнее время аларм «уезжает» по локальным часам.
 */
function scheduleReminder(reminder) {
  const { id, time } = reminder;
  // Дни приводим к числам: из бэкапа они могут прийти строками
  const days = Array.isArray(reminder.days) ? reminder.days.map(Number) : [];

  if (!time || days.length === 0) return;

  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return;

  const next = new Date();
  next.setHours(hours, minutes, 0, 0);

  // Сегодняшнее время уже прошло либо день не выбран — идём вперёд по дням
  if (next <= new Date()) next.setDate(next.getDate() + 1);

  // Максимум 7 шагов — защита от «зависшего» поиска при некорректных данных
  for (let step = 0; step < 8 && !days.includes(next.getDay()); step += 1) {
    next.setDate(next.getDate() + 1);
  }

  chrome.alarms.create(REMINDER_ALARM_PREFIX + id, { when: next.getTime() });
}

// ==================== УВЕДОМЛЕНИЯ ====================

/**
 * Показывает системное уведомление.
 *  - silent: true          — звук играем сами через offscreen, чтобы его можно было прервать;
 *  - requireInteraction    — уведомление висит, пока его не закроют. Иначе оно само
 *                            пропадает и обрывает звук раньше, чем пользователь его увидел.
 */
function showNotification(id, title, message) {
  chrome.notifications.create(id, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL(ICON_URL),
    title,
    message,
    priority: 2,
    silent: true,
    requireInteraction: true,
  });
}

/** Срабатывание напоминания: уведомление + (опционально) звук. */
function fireReminder(reminder) {
  showNotification(
    `notify_${reminder.id}_${Date.now()}`,
    `⏰ ${reminder.title}`,
    `Время: ${reminder.time}`,
  );

  // «Без звука» — значит действительно без звука (раньше играл бип)
  if (reminder.sound !== 'none') {
    playReminderSound(reminder.sound || null);
  }
}

/** Тестовое уведомление со звуком (кнопка в popup). */
function fireTestNotification() {
  showNotification('test_notification', 'Тест уведомления', 'Работа уведомлений проверена!');
  playReminderSound(null);
}

/**
 * Закрытие любого уведомления (крестик или таймаут) — глушим звук.
 * Звучит всегда максимум один, поэтому не важно, какое именно закрыли.
 */
chrome.notifications.onClosed.addListener(() => stopReminderSound());

/**
 * Клик по уведомлению = «прочитал». Закрываем его, что вызовет onClosed
 * и остановит звук (Chrome по клику уведомление не скрывает сам).
 */
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
});

// ==================== РЕЗЕРВНОЕ КОПИРОВАНИЕ ====================

async function ensureBackupAlarm() {
  const existing = await chrome.alarms.get(BACKUP_ALARM);
  if (existing) return;

  chrome.alarms.create(BACKUP_ALARM, {
    delayInMinutes: BACKUP_INTERVAL_MIN,
    periodInMinutes: BACKUP_INTERVAL_MIN,
  });
}

async function createBackup() {
  try {
    const reminders = await getReminders();
    if (reminders.length === 0) return;

    await chrome.storage.sync.set({
      reminders_backup: reminders,
      backup_time: new Date().toISOString(),
      backup_count: reminders.length,
    });
  } catch (error) {
    console.error('Ошибка резервного копирования:', error);
  }
}

/** @returns {Promise<boolean>} удалось ли восстановить */
async function restoreFromBackup() {
  try {
    const { reminders_backup: backup } = await chrome.storage.sync.get('reminders_backup');
    if (!Array.isArray(backup)) return false;

    await chrome.storage.local.set({
      reminders: backup,
      restored_from_backup: new Date().toISOString(),
    });

    await scheduleAllReminders();
    return true;
  } catch (error) {
    console.error('Ошибка восстановления:', error);
    return false;
  }
}

// ==================== СОБЫТИЯ РАСШИРЕНИЯ ====================

chrome.runtime.onStartup.addListener(initializeApp);
chrome.runtime.onInstalled.addListener(initializeApp);

// onMessage: возвращаем true, когда ответ асинхронный (sendResponse позже)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'updateReminders':
      scheduleAllReminders().then(() => sendResponse({ success: true }));
      return true;

    case 'testNotification':
      fireTestNotification();
      sendResponse({ success: true });
      return true;

    case 'restoreBackup':
      restoreFromBackup().then((success) => sendResponse({ success }));
      return true;

    default:
      sendResponse({ success: false, error: 'Неизвестное действие' });
      return false;
  }
});

// ==================== АЛАРМЫ ====================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === BACKUP_ALARM) {
    createBackup();
    return;
  }

  if (!alarm.name.startsWith(REMINDER_ALARM_PREFIX)) return;

  const id = Number(alarm.name.slice(REMINDER_ALARM_PREFIX.length));
  const reminder = (await getReminders()).find((item) => item.id === id);
  if (!reminder || !reminder.enabled) return;

  // Проверка дня нужна на случай переноса времени/будильников ОС
  const days = Array.isArray(reminder.days) ? reminder.days.map(Number) : [];
  if (days.includes(new Date().getDay())) {
    fireReminder(reminder);
  }

  scheduleReminder(reminder); // ставим следующее срабатывание
});

// ==================== СТАРТ ====================

initializeApp();