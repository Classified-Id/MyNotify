// Флаг инициализации
let isInitialized = false;

// Основная функция инициализации
async function initializeApp() {
  if (isInitialized) {
    console.log('MyNotify уже инициализирован');
    return;
  }

  console.log('🚀 Инициализация MyNotify...');

  try {
    // 1. Проверяем, есть ли сохраненные данные
    const result = await chrome.storage.local.get(['reminders', 'appInitialized']);
    console.log('Данные из storage:', result);

    // 2. Если приложение не инициализировано или нет напоминаний
    if (!result.appInitialized || !result.reminders || !Array.isArray(result.reminders)) {
      console.log('Создаем начальные данные...');

      const defaultReminders = [];

      // Сохраняем с меткой инициализации
      await chrome.storage.local.set({
        reminders: defaultReminders,
        appInitialized: true,
        lastUpdate: new Date().toISOString()
      });

      console.log('Созданы начальные данные');
    } else {
      console.log(`Найдено ${result.reminders.length} сохраненных напоминаний`);
    }

    // 3. Загружаем напоминания и планируем их
    const data = await chrome.storage.local.get(['reminders']);
    if (data.reminders && Array.isArray(data.reminders)) {
      scheduleAllReminders(data.reminders);
    }

    // 4. Устанавливаем флаг
    isInitialized = true;
    console.log('✅ MyNotify успешно инициализирован');

  } catch (error) {
    console.error('❌ Ошибка инициализации:', error);
  }
}

// ========== ОБРАБОТЧИКИ СОБЫТИЙ ==========

// При запуске браузера
chrome.runtime.onStartup.addListener(() => {
  console.log('🔄 Браузер запущен, инициализируем MyNotify...');
  initializeApp();
});

// При установке/обновлении расширения
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`📦 Расширение ${details.reason}`);
  initializeApp();
});

// При получении сообщений от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('📨 Получено сообщение:', request.action);

  if (request.action === 'updateReminders') {
    // Обновляем будильники
    chrome.storage.local.get(['reminders'], (result) => {
      if (result.reminders) {
        scheduleAllReminders(result.reminders);
      }
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  }

  if (request.action === 'testNotification') {
    // Тестовое уведомление
    sendTestNotification();
    sendResponse({ success: true });
    return true;
  }

  if (request.action === 'restoreBackup') {
    // Восстановление из backup
    restoreFromBackup().then(success => {
      sendResponse({ success });
    });
    return true;
  }

  sendResponse({ success: false, error: 'Неизвестное действие' });
});

// ========== ФУНКЦИИ ДЛЯ БУДИЛЬНИКОВ ==========

// Планирование всех напоминаний
function scheduleAllReminders(reminders) {
  if (!reminders || !Array.isArray(reminders)) {
    console.log('⚠️ Нет напоминаний для планирования');
    return;
  }

  console.log(`⏰ Планируем ${reminders.length} напоминаний...`);

  // Очищаем все старые будильники
  chrome.alarms.clearAll();

  // Фильтруем только активные напоминания
  const activeReminders = reminders.filter(r => r.enabled);
  console.log(`Активных: ${activeReminders.length}`);

  // Создаем будильники для каждого активного напоминания
  activeReminders.forEach(reminder => {
    scheduleReminder(reminder);
  });
}

// Планирование одного напоминания
function scheduleReminder(reminder) {
  if (!reminder || !reminder.time || !reminder.days) {
    console.error('❌ Неверный формат напоминания:', reminder);
    return;
  }

  const now = new Date();
  const [hours, minutes] = reminder.time.split(':').map(Number);

  // Время напоминания на сегодня
  const reminderTime = new Date();
  reminderTime.setHours(hours, minutes, 0, 0);

  // Если время уже прошло сегодня, планируем на завтра
  if (reminderTime < now) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  // Ищем ближайший подходящий день
  let dayOfWeek = reminderTime.getDay();
  while (!reminder.days.includes(dayOfWeek)) {
    reminderTime.setDate(reminderTime.getDate() + 1);
    dayOfWeek = reminderTime.getDay();
  }

  // Время до напоминания в минутах
  const timeInMs = reminderTime.getTime() - now.getTime();
  const timeInMinutes = Math.max(1, Math.floor(timeInMs / 60000));

  // Уникальное имя будильника
  const alarmName = `reminder_${reminder.id}`;

  // Создаем будильник
  chrome.alarms.create(alarmName, {
    delayInMinutes: timeInMinutes,
    periodInMinutes: 24 * 60 // повтор каждые 24 часа
  });

  console.log(`✅ Напоминание "${reminder.title}" запланировано на ${reminderTime.toLocaleString()}`);
}

// Обработчик срабатывания будильников
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    const reminderId = parseInt(alarm.name.split('_')[1]);

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      const reminder = reminders.find(r => r.id === reminderId);

      if (reminder && reminder.enabled) {
        // Проверяем день недели
        const now = new Date();
        const dayOfWeek = now.getDay();

        if (reminder.days.includes(dayOfWeek)) {
          console.log(`🔔 Сработало напоминание: ${reminder.title} в ${reminder.time}`);
          sendNotification(reminder);
        }
      }
    });
  }
});

// ========== ФУНКЦИИ УВЕДОМЛЕНИЙ ==========

// Отправка уведомления
function sendNotification(reminder) {
  // 1. Воспроизводим звук
  if (reminder.sound && reminder.sound !== 'none') {
    playReminderSound(reminder.sound);
  } else {
    playWebAudioBeep(); // Стандартный звук
  }

  // 2. Показываем уведомление
  setTimeout(() => {
    chrome.notifications.create(`notify_${reminder.id}_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: '⏰ ' + reminder.title,
      message: `Время: ${reminder.time}`,
      priority: 2,
      silent: true // отключаем системный звук
    });
  }, 100);
}

// Тестовое уведомление
function sendTestNotification() {
  console.log('🔊 Тестовое уведомление');

  // Проигрываем тестовый звук
  playWebAudioBeep();

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

// Воспроизведение звука напоминания
function playReminderSound(soundFile) {
  try {
    const soundPath = chrome.runtime.getURL(`sounds/${soundFile}`);
    console.log('🔊 Воспроизведение:', soundPath);

    const audio = new Audio(soundPath);
    audio.volume = 0.7;
    audio.play().catch(e => {
      console.error('Ошибка воспроизведения звука:', e);
      playWebAudioBeep(); // Fallback
    });
  } catch (error) {
    console.error('Ошибка создания аудио:', error);
    playWebAudioBeep(); // Fallback
  }
}

// Web Audio API звук (fallback)
function playWebAudioBeep() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    oscillator.onended = () => {
      audioContext.close();
    };

  } catch (error) {
    console.error('Web Audio ошибка:', error);
  }
}

// ========== РЕЗЕРВНОЕ КОПИРОВАНИЕ ==========

// Создание резервной копии
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

      console.log(`✅ Создана резервная копия ${reminders.length} напоминаний`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('❌ Ошибка создания резервной копии:', error);
    return false;
  }
}

// Восстановление из резервной копии
async function restoreFromBackup() {
  try {
    const backup = await chrome.storage.sync.get(['reminders_backup']);

    if (backup.reminders_backup) {
      await chrome.storage.local.set({
        reminders: backup.reminders_backup,
        restored_from_backup: new Date().toISOString()
      });

      // Перепланируем напоминания
      scheduleAllReminders(backup.reminders_backup);

      console.log(`✅ Восстановлено ${backup.reminders_backup.length} напоминаний из резервной копии`);
      return true;
    }

    console.log('⚠️ Резервная копия не найдена');
    return false;
  } catch (error) {
    console.error('❌ Ошибка восстановления:', error);
    return false;
  }
}

// Периодическое создание резервных копий
setInterval(() => {
  chrome.storage.local.get(['reminders'], (result) => {
    if (result.reminders && result.reminders.length > 0) {
      createBackup();
    }
  });
}, 5 * 60 * 1000); // Каждые 5 минут

// ========== ЗАПУСК ==========

// Запускаем инициализацию сразу
initializeApp();
