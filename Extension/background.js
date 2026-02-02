// Инициализация при установке
chrome.runtime.onInstalled.addListener(() => {
  console.log('TimeNotify установлен!');

  const defaultReminders = [
    {
      id: 1,
      title: "Утренний созвон333",
      time: "01:03",
      enabled: true,
      days: [1, 2, 3, 4, 5, 6, 0],
      sound: "111.mp3"
    },
  ];

  chrome.storage.local.set({ reminders: defaultReminders });

  scheduleAllReminders(defaultReminders);
});

// Функция для создания будильников Chrome
function scheduleAllReminders(reminders) {
  // Очищаем старые будильники
  chrome.alarms.clearAll();

  reminders.forEach(reminder => {
    if (reminder.enabled) {
      scheduleReminder(reminder);
    }
  });
}

// Функция для создания одного напоминания
function scheduleReminder(reminder) {
  const now = new Date();
  const [hours, minutes] = reminder.time.split(':').map(Number);

  // Время напоминания на сегодня
  const reminderTime = new Date();
  reminderTime.setHours(hours, minutes, 0, 0);

  // Если время уже прошло сегодня, планируем на завтра
  if (reminderTime < now) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  // Проверяем день недели (0 - воскресенье, 1 - понедельник и т.д.)
  const dayOfWeek = reminderTime.getDay();

  // Если сегодня не подходящий день, находим следующий подходящий
  while (!reminder.days.includes(dayOfWeek)) {
    reminderTime.setDate(reminderTime.getDate() + 1);
    dayOfWeek = reminderTime.getDay();
  }

  // Время до напоминания в минутах
  const timeInMs = reminderTime.getTime() - now.getTime();
  const timeInMinutes = Math.max(1, Math.floor(timeInMs / 60000));

  // Создаем будильник с уникальным именем
  const alarmName = `reminder_${reminder.id}`;
  chrome.alarms.create(alarmName, {
    delayInMinutes: timeInMinutes,
    periodInMinutes: 24 * 60 // повторять каждые 24 часа
  });

  console.log(`Напоминание "${reminder.title}" установлено на ${reminderTime.toLocaleTimeString()}`);
}

// Обработчик будильников
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('reminder_')) {
    const reminderId = parseInt(alarm.name.split('_')[1]);

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      const reminder = reminders.find(r => r.id === reminderId);

      if (reminder && reminder.enabled) {
        // Отправляем уведомление
        sendNotification(reminder);
      }
    });
  }
});

// Функция отправки уведомления
function sendNotification(reminder) {
  const now = new Date();
  const dayOfWeek = now.getDay();

  if (!reminder.days.includes(dayOfWeek)) {
    return;
  }

  console.log(`🔔 Отправка уведомления: ${reminder.title} в ${reminder.time}`);

  // 1. Сначала звук через Web Audio API
  playWebAudioBeep();

  // 2. Потом уведомление (через небольшую задержку)
  setTimeout(() => {
    chrome.notifications.create(`notify_${reminder.id}_${Date.now()}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: '⏰ ' + reminder.title,
      message: `Время: ${reminder.time}`,
      priority: 2,
      silent: true // отключаем системный звук
    });
    console.log('Уведомление показано');
  }, 50);
}

// Web Audio API звук (работает в background!)
function playWebAudioBeep() {
  try {
    console.log('Пробуем Web Audio API...');

    // Создаем AudioContext
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Создаем осциллятор для beep звука
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    // Подключаем
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Настройки звука
    oscillator.frequency.value = 800; // Частота (800 Гц)
    oscillator.type = 'sine'; // Тип волны

    // Настройка громкости (плавное затухание)
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    // Воспроизводим
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);

    console.log('✅ Web Audio звук запущен');

    // Освобождаем ресурсы
    oscillator.onended = () => {
      audioContext.close();
      console.log('Web Audio завершен');
    };

  } catch (error) {
    console.error('❌ Web Audio ошибка:', error);
    // Fallback на обычный beep
  }
}

// Обработчик сообщений от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateReminders') {
    chrome.storage.local.get(['reminders'], (result) => {
      scheduleAllReminders(result.reminders || []);
      sendResponse({ success: true });
    });
    return true; // Асинхронный ответ
  }

  // Обработчик тестового уведомления
  if (request.action === 'testNotification') {
    // Отправляем тестовое уведомление из background
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon48.png'),
      title: request.title || 'Тест',
      message: request.message || 'Тестовое уведомление',
      priority: 2,
      silent: false
    });
    sendResponse({ success: true });
    return true;
  }
});
