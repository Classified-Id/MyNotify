// ============================================================
// MyNotify Background Service Worker (Manifest V3)
// ============================================================

let isInitialized = false;
const OFFSCREEN_DOC_PATH = 'offscreen.html';
const BACKUP_ALARM_NAME = 'backupAlarm';
const BACKUP_INTERVAL_MIN = 5;

// ========== ИНИЦИАЛИЗАЦИЯ ==========

async function initializeApp() {
  if (isInitialized) {
    console.log('MyNotify уже инициализирован');
    return;
  }

  console.log('🚀 Инициализация MyNotify...');

  try {
    const result = await chrome.storage.local.get(['reminders', 'appInitialized']);

    if (!result.appInitialized || !result.reminders || !Array.isArray(result.reminders)) {
      console.log('Создаем начальные данные...');
      await chrome.storage.local.set({
        reminders: [],
        appInitialized: true,
        lastUpdate: new Date().toISOString()
      });
    } else {
      console.log(`Найдено ${result.reminders.length} сохраненных напоминаний`);
    }

    const data = await chrome.storage.local.get(['reminders']);
    if (data.reminders && Array.isArray(data.reminders)) {
      scheduleAllReminders(data.reminders);
    }

    isInitialized = true;
    console.log('✅ MyNotify успешно инициализирован');

  } catch (error) {
    console.error('❌ Ошибка инициализации:', error);
  }
}

// ========== OFFSREEN DOCUMENT ==========

/**
 * Активирует offscreen document для воспроизведения звука.
 */
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOC_PATH)]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOC_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Воспроизведение звука напоминаний'
  });
}

// ========== ОБРАБОТЧИКИ СОБЫТИЙ ==========

chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Браузер запущен, инициализируем MyNotify...');
  initializeApp();
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`📦 Расширение ${details.reason}`);
  initializeApp();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Получено сообщение:', request.action);

  if (request.action === 'updateReminders') {
    chrome.storage.local.get(['reminders'], (result) => {
      if (result.reminders) {
        scheduleAllReminders(result.reminders);
      }
      sendResponse({success: true});
    });
    return true;
  }

  if (request.action === 'testNotification') {
    sendTestNotification();
    sendResponse({success: true});
    return true;
  }

  if (request.action === 'restoreBackup') {
    restoreFromBackup().then(success => {
      sendResponse({success});
    });
    return true;
  }

  sendResponse({success: false, error: 'Неизвестное действие'});
});

// ========== БУДИЛЬНИКИ ==========

function scheduleAllReminders(reminders) {
  if (!reminders || !Array.isArray(reminders)) return;

  console.log(`⏰ Планируем ${reminders.length} напоминаний...`);
  chrome.alarms.clearAll();

  const activeReminders = reminders.filter(r => r.enabled);

  // Отдельно восстанавливаем резервный alarm
  ensureBackupAlarm();

  activeReminders.forEach(reminder => scheduleReminder(reminder));
}

function scheduleReminder(reminder) {
  if (!reminder || !reminder.time || !reminder.days) return;

  const now = new Date();
  const [hours, minutes] = reminder.time.split(':').map(Number);
  const reminderTime = new Date();
  reminderTime.setHours(hours, minutes, 0, 0);

  if (reminderTime < now) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  let dayOfWeek = reminderTime.getDay();
  while (!reminder.days.includes(dayOfWeek)) {
    reminderTime.setDate(reminderTime.getDate() + 1);
    dayOfWeek = reminderTime.getDay();
  }

  const timeInMs = reminderTime.getTime() - now.getTime();
  const timeInMinutes = Math.max(1, Math.floor(timeInMs / 60000));

  chrome.alarms.create(`reminder_${reminder.id}`, {
    delayInMinutes: timeInMinutes,
    periodInMinutes: 24 * 60
  });

  console.log(`✅ "${reminder.title}" запланировано на ${reminderTime.toLocaleString()}`);
}

// ========== ОБРАБОТЧИК СРАБАТЫВАНИЯ АЛАРМОВ ==========

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BACKUP_ALARM_NAME) {
    createBackup();
    return;
  }

  if (alarm.name.startsWith('reminder_')) {
    const reminderId = parseInt(alarm.name.split('_')[1]);

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      const reminder = reminders.find(r => r.id === reminderId);

      if (reminder && reminder.enabled) {
        const now = new Date();
        if (reminder.days.includes(now.getDay())) {
          console.log(`🔔 Сработало: ${reminder.title} в ${reminder.time}`);
          sendNotification(reminder);
        }
      }
    });
  }
});

// ========== УВЕДОМЛЕНИЯ ==========

async function sendNotification(reminder) {
  // Звук через offscreen document
  ensureOffscreenDocument().then(() => {
    const soundFile = (reminder.sound && reminder.sound !== 'none') ? reminder.sound : null;
    chrome.runtime.sendMessage({action: 'playSound', soundFile: soundFile})
      .catch(() => {}); // offscreen может быть не готов — не критично
  });

  setTimeout(() => {
    chrome.notifications.create(`notify_${reminder.id}_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: '⏰ ' + reminder.title,
      message: `Время: ${reminder.time}`,
      priority: 2,
      silent: true
    });
  }, 100);
}

function sendTestNotification() {
  console.log('🔊 Тестовое уведомление');

  ensureOffscreenDocument().then(() => {
    chrome.runtime.sendMessage({action: 'playSound', soundFile: null})
      .catch(() => {});
  });

  setTimeout(() => {
    chrome.notifications.create('test_notification', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: 'Тест уведомления',
      message: 'Работа уведомлений проверена!',
      priority: 2,
      silent: true
    });
  }, 100);
}

// ========== РЕЗЕРВНОЕ КОПИРОВАНИЕ ==========

function ensureBackupAlarm() {
  chrome.alarms.get(BACKUP_ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(BACKUP_ALARM_NAME, {
        delayInMinutes: BACKUP_INTERVAL_MIN,
        periodInMinutes: BACKUP_INTERVAL_MIN
      });
    }
  });
}

async function createBackup() {
  try {
    const result = await chrome.storage.local.get(['reminders']);
    const reminders = result.reminders || [];

    if (reminders.length > 0) {
      await chrome.storage.sync.set({
        reminders_backup: reminders,
        backup_time: new Date().toISOString(),
        backup_count: reminders.length
      });
      console.log(`✅ Резервная копия: ${reminders.length} напоминаний`);
    }
  } catch (error) {
    console.error('❌ Ошибка резервного копирования:', error);
  }
}

async function restoreFromBackup() {
  try {
    const backup = await chrome.storage.sync.get(['reminders_backup']);

    if (backup.reminders_backup) {
      await chrome.storage.local.set({
        reminders: backup.reminders_backup,
        restored_from_backup: new Date().toISOString()
      });

      scheduleAllReminders(backup.reminders_backup);
      console.log(`✅ Восстановлено ${backup.reminders_backup.length} напоминаний`);
      return true;
    }

    console.log('⚠️ Резервная копия не найдена');
    return false;
  } catch (error) {
    console.error('❌ Ошибка восстановления:', error);
    return false;
  }
}

// ========== ЗАПУСК ==========

initializeApp();