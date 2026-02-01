// Инициализация при установке
chrome.runtime.onInstalled.addListener(() => {
  console.log('TimeNotify установлен!');

  // Создаем тестовые напоминания
  const defaultReminders = [
    {
      id: 1,
      title: "Утренний созвон",
      time: "09:30",
      enabled: true,
      days: [1, 2, 3, 4, 5], // Пн-Пт
      sound: "chime.mp3"
    },
    {
      id: 2,
      title: "Обед",
      time: "13:00",
      enabled: true,
      days: [1, 2, 3, 4, 5],
      sound: "beep.mp3"
    }
  ];

  chrome.storage.local.set({ reminders: defaultReminders });

  // Создаем все напоминания
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

  // Проверяем, сегодня ли нужно показывать напоминание
  if (!reminder.days.includes(dayOfWeek)) {
    return;
  }

  // Создаем уведомление
  chrome.notifications.create(`notify_${reminder.id}_${Date.now()}`, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: '⏰ ' + reminder.title,
    message: `Время: ${reminder.time}`,
    priority: 2,
    silent: false // Стандартный звук
  });

  // Проигрываем кастомный звук, если есть
  if (reminder.sound && reminder.sound !== 'none') {
    playSound(reminder.sound);
  }
}

// Воспроизведение звука
function playSound(soundFile) {
  try {
    const audio = new Audio(chrome.runtime.getURL(`sounds/${soundFile}`));
    audio.volume = 0.7;
    audio.play().catch(e => console.log('Ошибка воспроизведения:', e));
  } catch (error) {
    console.error('Ошибка загрузки звука:', error);
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
});
