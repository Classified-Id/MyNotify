// popup.js — интерфейс MyNotify: форма создания + список напоминаний.

const STORAGE_KEY = 'reminders';
const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

/**
 * Безопасная отправка сообщения в background.
 * В старых сборках Chromium sendMessage не возвращает Promise — тогда null.
 */
function sendToBackground(message) {
  try {
    return Promise.resolve(chrome.runtime.sendMessage(message)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

// ==================== ДОСТУП К ХРАНИЛИЩУ ====================

/** Читает список напоминаний (всегда массив, даже если данных нет). */
function loadReminders() {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, ({ reminders }) => {
      resolve(Array.isArray(reminders) ? reminders : []);
    });
  });
}

/**
 * Сохраняет список и просит background перепланировать алармы.
 * @returns {Promise<void>}
 */
function saveReminders(reminders) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: reminders }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      // background может не ответить (ещё не поднялся) — для UI это не критично
      sendToBackground({ action: 'updateReminders' });
      resolve();
    });
  });
}

/** Изменённый список: сохраняем, перепланируем, перерисовываем. */
async function commit(reminders) {
  try {
    await saveReminders(reminders);
    render(reminders);
  } catch (error) {
    console.error('Ошибка сохранения:', error);
    alert('Ошибка сохранения напоминания');
  }
}

// ==================== ОТРИСОВКА СПИСКА ====================

/** Человекочитаемое описание дней: «Ежедневно», «Пн-Пт» или «Пн, Ср». */
function getDaysText(days) {
  if (!Array.isArray(days) || days.length === 0) return 'Нет дней';
  if (days.length === 7) return 'Ежедневно';
  if (days.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return 'Пн-Пт';

  return [...days].sort((a, b) => a - b).map((day) => DAY_NAMES[day]).join(', ');
}

/** Создаёт карточку одного напоминания. */
function createReminderCard(reminder, onToggle, onDelete) {
  const card = document.createElement('fieldset');
  card.className = 'reminderInfo';

  const legend = document.createElement('legend');
  legend.className = 'legend';
  legend.textContent = `${reminder.title} ${reminder.enabled ? '✅' : '❌'}`;

  const details = document.createElement('div');
  details.className = 'reminderDetails';

  [
    `⏰ ${reminder.time}`,
    `📅 ${getDaysText(reminder.days)}`,
    `🔊 ${reminder.sound === 'none' ? 'Без звука' : 'Со звуком'}`,
  ].forEach((text) => {
    const item = document.createElement('span');
    item.textContent = text;
    details.appendChild(item);
  });

  const actions = document.createElement('div');
  actions.className = 'reminderActions';

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'toggleBtn';
  toggleBtn.textContent = reminder.enabled ? 'Выкл' : 'Вкл';
  toggleBtn.addEventListener('click', () => onToggle(reminder.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'deleteBtn';
  deleteBtn.textContent = 'Удалить';
  deleteBtn.addEventListener('click', () => onDelete(reminder.id));

  actions.append(toggleBtn, deleteBtn);

  card.append(legend, details, actions);
  return card;
}

/** Полная перерисовка списка напоминаний. */
function render(reminders) {
  const container = document.getElementById('remindersList');
  if (!container) return;

  container.replaceChildren();

  if (reminders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Нет напоминаний';
    container.appendChild(empty);
    return;
  }

  reminders.forEach((reminder) => {
    container.appendChild(createReminderCard(reminder, toggleReminder, deleteReminder));
  });
}

// ==================== ДЕЙСТВИЯ ПОЛЬЗОВАТЕЛЯ ====================

async function toggleReminder(id) {
  const reminders = await loadReminders();
  const reminder = reminders.find((item) => item.id === id);
  if (!reminder) return;

  reminder.enabled = !reminder.enabled;
  await commit(reminders);
}

async function deleteReminder(id) {
  if (!confirm('Удалить это напоминание?')) return;

  const reminders = await loadReminders();
  await commit(reminders.filter((item) => item.id !== id));
}

/** Читает форму; возвращает null, если данные неполные. */
function readForm() {
  const titleInput = document.getElementById('reminderTitle');
  const timeInput = document.getElementById('reminderTime');
  const soundSelect = document.getElementById('reminderSound');
  if (!titleInput || !timeInput || !soundSelect) return null;

  const title = titleInput.value.trim();
  const days = Array.from(document.querySelectorAll('input[name="day"]:checked'))
    .map((checkbox) => Number(checkbox.value));

  if (!title) {
    titleInput.focus();
    return null;
  }
  if (days.length === 0) {
    alert('Выберите хотя бы один день');
    return null;
  }

  return { title, time: timeInput.value, days, sound: soundSelect.value };
}

async function addReminder() {
  const form = readForm();
  if (!form) return;

  const reminders = await loadReminders();
  reminders.push({
    id: Date.now(),
    enabled: true,
    ...form,
  });

  await commit(reminders);

  const titleInput = document.getElementById('reminderTitle');
  if (titleInput) {
    titleInput.value = '';
    titleInput.focus();
  }
}

/** Восстановление списка из синхронизированного бэкапа. */
async function restoreBackup() {
  if (!confirm('Заменить текущий список напоминаний копией из бэкапа?')) return;

  const response = await sendToBackground({ action: 'restoreBackup' });
  if (!response?.success) {
    alert('Резервная копия не найдена');
    return;
  }

  render(await loadReminders());
}

// ==================== ЧАСЫ ====================

function updateCurrentTime() {
  const el = document.getElementById('currentTime');
  if (!el) return;

  el.textContent = new Date().toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// ==================== СТАРТ ====================

document.addEventListener('DOMContentLoaded', async () => {
  updateCurrentTime();
  setInterval(updateCurrentTime, 1000);

  render(await loadReminders());

  document.getElementById('addReminderBtn')?.addEventListener('click', addReminder);
  document.getElementById('restoreBackupBtn')?.addEventListener('click', restoreBackup);
  document.getElementById('testNotificationBtn')?.addEventListener('click', () => {
    sendToBackground({ action: 'testNotification' });
  });

  document.getElementById('reminderTitle')?.focus();
});