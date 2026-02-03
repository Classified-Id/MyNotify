// popup.js
document.addEventListener('DOMContentLoaded', function() {
  // Обновляем время
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);

  // Загружаем напоминания
  loadReminders();

  // Автофокус на поле ввода
  const titleInput = document.getElementById('reminderTitle');
  if (titleInput) {
    titleInput.focus();
  }

  // ========== ФУНКЦИИ ==========

  // Загрузка напоминаний
  function loadReminders() {
    chrome.storage.local.get(['reminders'], (result) => {
      let reminders = result.reminders || [];

      // Проверяем, что это массив
      if (!Array.isArray(reminders)) {
        console.warn('reminders не является массивом, исправляем...');
        reminders = [];
        chrome.storage.local.set({ reminders: [] });
      }

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
      const statusIcon = reminder.enabled ? '✅' : '❌';
      const toggleText = reminder.enabled ? 'Выкл' : 'Вкл';

      const reminderEl = document.createElement('div');
      reminderEl.className = 'reminderItem';
      reminderEl.innerHTML = `
        <fieldset class="reminderInfo">
          <legend class="legend">${reminder.title} ${statusIcon}</legend>
          <div class="reminderDetails">
            <time>⏰ ${reminder.time}</time>
            <span>📅 ${daysText}</span>
            <span>🔊 ${soundText}</span>
          </div>
          <div class="reminderActions">
            <button class="toggleBtn btnAccept mla" data-id="${reminder.id}">${toggleText}</button>
            <button class="deleteBtn btnAccept" data-id="${reminder.id}">Удалить</button>
          </div>
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
    if (!days || !Array.isArray(days)) return 'Нет дней';

    const dayNames = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
    const selectedDays = days.map(d => dayNames[d]);

    if (selectedDays.length === 7) return 'Ежедневно';
    if (selectedDays.length === 5 &&
      days.includes(1) && days.includes(2) && days.includes(3) &&
      days.includes(4) && days.includes(5)) return 'Пн-Пт';

    return selectedDays.join(', ');
  }

  // Добавление нового напоминания
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
        let reminders = result.reminders || [];

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

        // Сохраняем с обработкой ошибок
        chrome.storage.local.set({ reminders: reminders }, () => {
          if (chrome.runtime.lastError) {
            console.error('Ошибка сохранения:', chrome.runtime.lastError);
            alert('Ошибка сохранения напоминания');
            return;
          }

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

    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      const index = reminders.findIndex(rem => rem.id === id);

      if (index !== -1) {
        reminders[index].enabled = !reminders[index].enabled;

        chrome.storage.local.set({ reminders: reminders }, () => {
          if (chrome.runtime.lastError) {
            console.error('Ошибка сохранения:', chrome.runtime.lastError);
            return;
          }

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
          if (chrome.runtime.lastError) {
            console.error('Ошибка удаления:', chrome.runtime.lastError);
            return;
          }

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

      // Используем background скрипт для теста
      chrome.runtime.sendMessage({
        action: 'testNotification'
      }, (response) => {
        if (response && response.success) {
          console.log('Тест уведомления выполнен');
        }
      });
    });
  }

  // Очистка всех напоминаний
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', function() {
      if (confirm('Удалить ВСЕ напоминания? Это действие нельзя отменить.')) {
        chrome.storage.local.set({ reminders: [] }, () => {
          if (chrome.runtime.lastError) {
            console.error('Ошибка очистки:', chrome.runtime.lastError);
            return;
          }

          displayReminders([]);
          chrome.runtime.sendMessage({ action: 'updateReminders' });
          console.log('Все напоминания удалены');
        });
      }
    });
  }

  // Кнопка восстановления из резервной копии (добавьте в HTML если нужно)
  const restoreBackupBtn = document.getElementById('restoreBackupBtn');
  if (restoreBackupBtn) {
    restoreBackupBtn.addEventListener('click', function() {
      if (confirm('Восстановить напоминания из последней резервной копии?')) {
        chrome.runtime.sendMessage({ action: 'restoreBackup' }, (response) => {
          if (response && response.success) {
            alert('Напоминания восстановлены из резервной копии!');
            loadReminders(); // Перезагружаем список
          } else {
            alert('Не удалось восстановить из резервной копии');
          }
        });
      }
    });
  }
});

// Обновление текущего времени
function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const currentTimeElement = document.getElementById('currentTime');
  if (currentTimeElement) {
    currentTimeElement.textContent = timeString;
  }
}
