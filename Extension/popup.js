document.addEventListener('DOMContentLoaded', function() {
  // Загружаем напоминания
  function loadReminders() {
    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      console.log('Загружено напоминаний:', reminders.length);
      displayReminders(reminders);
    });
  }

  // Отображение списка напоминаний
  function displayReminders(reminders) {
    const container = document.getElementById('remindersList');
    if (!container) {
      console.error('Элемент remindersList не найден!');
      return;
    }

    if (reminders.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет напоминаний</div>';
      return;
    }

    container.innerHTML = '';

    reminders.forEach(reminder => {
      const daysText = getDaysText(reminder.days);
      const soundText = reminder.sound === 'none' ? 'Без звука' : 'Со звуком';

      const reminderEl = document.createElement('div');
      reminderEl.className = 'reminderItem';
      reminderEl.innerHTML = `
        <fieldset class="reminderInfo">
          <legend class="legend">${reminder.title} ${reminder.enabled ? '✅' : '❌'}</legend>
          <div class="reminderDetails">
            <time>⏰ ${reminder.time}</time>
            <span>📅 ${daysText}</span>
            <span>🔊 ${soundText}</span>
          </div>
          <button class="toggleBtn mla" data-id="${reminder.id}">${reminder.enabled ? 'Выкл' : 'Вкл'}</button>
          <button class="deleteBtn" data-id="${reminder.id}">Удалить</button>
        </fieldset>
      `;

      container.appendChild(reminderEl);
    });

    // Добавляем обработчики кнопок
    document.querySelectorAll('.toggleBtn').forEach(btn => {
      btn.addEventListener('click', toggleReminder);
    });

    document.querySelectorAll('.deleteBtn').forEach(btn => {
      btn.addEventListener('click', deleteReminder);
    });
  }

  // Получение текстового представления дней
  function getDaysText(days) {
    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const selectedDays = days.map(d => dayNames[d]);

    if (selectedDays.length === 7) return 'Ежедневно';
    if (selectedDays.length === 5 &&
      days.includes(1) && days.includes(2) && days.includes(3) &&
      days.includes(4) && days.includes(5)) return 'Пн-Пт';

    return selectedDays.join(', ');
  }

  /** Добавление нового напоминания */
  const addReminderBtn = document.getElementById('addReminderBtn');

  if (addReminderBtn) {
    addReminderBtn.addEventListener('click', function() {
      const titleInput = document.getElementById('reminderTitle');
      const timeInput = document.getElementById('reminderTime');
      const soundSelect = document.getElementById('reminderSound');

      if (!titleInput || !timeInput || !soundSelect) {
        return;
      }

      const title = titleInput.value.trim();
      const time = timeInput.value;
      const sound = soundSelect.value;

      const dayCheckboxes = document.querySelectorAll('input[name="day"]:checked');
      const days = Array.from(dayCheckboxes).map(checkBox => parseInt(checkBox.value));

      if (!title) {
        titleInput.focus();
        return;
      }

      if (days.length === 0) {
        alert('Выберите хотя бы один день');
        return;
      }

      chrome.storage.local.get(['reminders'], (result) => {
        const reminders = result.reminders || [];

        // Создаем новое напоминание
        const newReminder = {
          id: Date.now(), // уникальный ID
          title: title,
          time: time,
          enabled: true,
          days: days,
          sound: sound
        };

        reminders.push(newReminder);

        // Сохраняем
        chrome.storage.local.set({ reminders: reminders }, () => {
          console.log('Напоминание сохранено:', newReminder);

          // Обновляем список
          displayReminders(reminders);

          // Сообщаем background скрипту об обновлении
          chrome.runtime.sendMessage({ action: 'updateReminders' });

          // Сбрасываем форму
          titleInput.value = '';
          titleInput.focus();
        });
      });
    });
  }

  // Переключение статуса напоминания
  function toggleReminder(e) {
    const id = parseInt(e.target.dataset.id);
    console.log('Переключение напоминания:', id);

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      const index = reminders.findIndex(r => r.id === id);

      if (index !== -1) {
        reminders[index].enabled = !reminders[index].enabled;

        chrome.storage.local.set({ reminders: reminders }, () => {
          displayReminders(reminders);
          chrome.runtime.sendMessage({ action: 'updateReminders' });
        });
      }
    });
  }

  // Удаление напоминания
  function deleteReminder(e) {
    const id = parseInt(e.target.dataset.id);
    console.log('Удаление напоминания:', id);

    if (confirm('Удалить это напоминание?')) {
      chrome.storage.local.get(['reminders'], (result) => {
        let reminders = result.reminders || [];
        reminders = reminders.filter(r => r.id !== id);

        chrome.storage.local.set({ reminders: reminders }, () => {
          displayReminders(reminders);
          chrome.runtime.sendMessage({ action: 'updateReminders' });
        });
      });
    }
  }

  // Тестовое уведомление
  const testNotificationBtn = document.getElementById('testNotificationBtn');
  if (testNotificationBtn) {
    testNotificationBtn.addEventListener('click', function() {
      console.log('Тестовое уведомление');

      // Сначала запрашиваем разрешение, если нужно
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            sendTestNotification();
          }
        });
      } else if (Notification.permission === 'granted') {
        sendTestNotification();
      } else {
        alert('Разрешите уведомления в настройках браузера');
      }
    });
  }

  function sendTestNotification() {
    // Получаем выбранный звук из выпадающего списка
    const soundSelect = document.getElementById('reminderSound');
    const soundFile = soundSelect ? soundSelect.value : '111.mp3';

    console.log('Выбранный звук для теста:', soundFile);

    // Воспроизводим звук, если выбран
    if (soundFile !== 'none') {
      // Используем правильный путь
      const soundPath = chrome.runtime.getURL(`sounds/${soundFile}`);
      console.log('Пытаемся воспроизвести:', soundPath);

      try {
        const audio = new Audio(soundPath);
        audio.volume = 0.5;
        audio.play()
          .then(() => console.log('Тестовый звук воспроизводится'))
          .catch(e => console.error('Ошибка воспроизведения тестового звука:', e));
      } catch (error) {
        console.error('Ошибка создания аудио:', error);
      }
    }

    // Ждем немного перед показом уведомления, чтобы звук начался первым
    setTimeout(() => {
      // Пробуем использовать Chrome API
      if (chrome.notifications && chrome.notifications.create) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: 'Тестовое уведомление',
          message: 'Это проверка работы уведомлений!',
          priority: 2,
          silent: true // Отключаем системный звук, т.к. играем свой
        });
      } else {
        // Fallback на стандартные уведомления
        new Notification('Тестовое уведомление', {
          body: 'Это проверка работы уведомлений!',
          icon: 'icons/icon48.png',
          silent: true // Отключаем системный звук
        });
      }
    }, 100); // Задержка 100ms для синхронизации звука и уведомления
  }

  // Очистка всех напоминаний
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function() {
      if (confirm('Удалить ВСЕ напоминания?')) {
        chrome.storage.local.set({ reminders: [] }, () => {
          displayReminders([]);
          chrome.runtime.sendMessage({ action: 'updateReminders' });
        });
      }
    });
  }

  loadReminders();

  // Автофокус на поле ввода
  const titleInput = document.getElementById('reminderTitle');
  if (titleInput) {
    titleInput.focus();
  }

  /** Проверяем доступность элементов */
  // console.log('Доступные элементы:');
  // console.log('- currentTime:', document.getElementById('currentTime'));
  // console.log('- reminderTitle:', document.getElementById('reminderTitle'));
  // console.log('- reminderTime:', document.getElementById('reminderTime'));
  // console.log('- reminderSound:', document.getElementById('reminderSound'));
  // console.log('- addReminderBtn:', document.getElementById('addReminderBtn'));
  // console.log('- remindersList:', document.getElementById('remindersList'));
  // console.log('- testNotificationBtn:', document.getElementById('testNotificationBtn'));
  // console.log('- clearAllBtn:', document.getElementById('clearAllBtn'));
});
