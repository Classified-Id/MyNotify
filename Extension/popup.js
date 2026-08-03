// popup.js — MyNotify

document.addEventListener('DOMContentLoaded', function () {
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);
  loadReminders();

  const titleInput = document.getElementById('reminderTitle');
  if (titleInput) titleInput.focus();

  // ========== ФУНКЦИИ ==========

  function loadReminders() {
    chrome.storage.local.get(['reminders'], (result) => {
      let reminders = result.reminders || [];
      if (!Array.isArray(reminders)) {
        console.warn('reminders не является массивом, исправляем...');
        reminders = [];
        chrome.storage.local.set({reminders: []});
      }
      console.log('Загружено напоминаний:', reminders.length);
      displayReminders(reminders);
    });
  }

  function displayReminders(reminders) {
    const container = document.getElementById('remindersList');
    if (!container) return;

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

      const fieldset = document.createElement('fieldset');
      fieldset.className = 'reminderInfo';

      const legend = document.createElement('legend');
      legend.className = 'legend';
      legend.textContent = `${reminder.title} ${statusIcon}`;

      const details = document.createElement('div');
      details.className = 'reminderDetails';
      details.innerHTML = `
        <time>⏰ ${escapeHtml(reminder.time)}</time>
        <span>📅 ${escapeHtml(daysText)}</span>
        <span>🔊 ${escapeHtml(soundText)}</span>
      `;

      const actions = document.createElement('div');
      actions.className = 'reminderActions';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggleBtn mla';
      toggleBtn.dataset.id = reminder.id;
      toggleBtn.textContent = toggleText;
      toggleBtn.addEventListener('click', toggleReminder);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'deleteBtn';
      deleteBtn.dataset.id = reminder.id;
      deleteBtn.textContent = 'Удалить';
      deleteBtn.addEventListener('click', deleteReminder);

      actions.appendChild(toggleBtn);
      actions.appendChild(deleteBtn);

      fieldset.appendChild(legend);
      fieldset.appendChild(details);
      fieldset.appendChild(actions);
      container.appendChild(fieldset);
    });
  }

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

  // ========== ДОБАВЛЕНИЕ ==========

  const addReminderBtn = document.getElementById('addReminderBtn');
  if (addReminderBtn) {
    addReminderBtn.addEventListener('click', function () {
      const titleInput = document.getElementById('reminderTitle');
      const timeInput = document.getElementById('reminderTime');
      const soundSelect = document.getElementById('reminderSound');
      if (!titleInput || !timeInput || !soundSelect) return;

      const title = titleInput.value.trim();
      const time = timeInput.value;
      const sound = soundSelect.value;

      const dayCheckboxes = document.querySelectorAll('input[name="day"]:checked');
      const days = Array.from(dayCheckboxes).map(cb => parseInt(cb.value));

      if (!title) { titleInput.focus(); return; }
      if (days.length === 0) { alert('Выберите хотя бы один день'); return; }

      chrome.storage.local.get(['reminders'], (result) => {
        const reminders = result.reminders || [];
        const newReminder = {
          id: Date.now(),
          title: title,
          time: time,
          enabled: true,
          days: days,
          sound: sound
        };

        reminders.push(newReminder);

        chrome.storage.local.set({reminders: reminders}, () => {
          if (chrome.runtime.lastError) {
            console.error('Ошибка сохранения:', chrome.runtime.lastError);
            alert('Ошибка сохранения напоминания');
            return;
          }
          console.log('Напоминание сохранено:', newReminder);
          displayReminders(reminders);
          chrome.runtime.sendMessage({action: 'updateReminders'});
          titleInput.value = '';
          titleInput.focus();
        });
      });
    });
  }

  // ========== TOGGLE / DELETE ==========

  function toggleReminder(e) {
    const id = parseInt(e.target.dataset.id);
    chrome.storage.local.get(['reminders'], (result) => {
      const reminders = result.reminders || [];
      const index = reminders.findIndex(rem => rem.id === id);
      if (index !== -1) {
        reminders[index].enabled = !reminders[index].enabled;
        chrome.storage.local.set({reminders: reminders}, () => {
          if (chrome.runtime.lastError) {
            console.error('Ошибка сохранения:', chrome.runtime.lastError);
            return;
          }
          displayReminders(reminders);
          chrome.runtime.sendMessage({action: 'updateReminders'});
        });
      }
    });
  }

  function deleteReminder(e) {
    const id = parseInt(e.target.dataset.id);
    if (!confirm('Удалить это напоминание?')) return;

    chrome.storage.local.get(['reminders'], (result) => {
      let reminders = result.reminders || [];
      reminders = reminders.filter(r => r.id !== id);
      chrome.storage.local.set({reminders: reminders}, () => {
        if (chrome.runtime.lastError) {
          console.error('Ошибка удаления:', chrome.runtime.lastError);
          return;
        }
        displayReminders(reminders);
        chrome.runtime.sendMessage({action: 'updateReminders'});
      });
    });
  }
});

// ========== УТИЛИТЫ (вне DOMContentLoaded) ==========

function updateCurrentTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const el = document.getElementById('currentTime');
  if (el) el.textContent = timeString;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}