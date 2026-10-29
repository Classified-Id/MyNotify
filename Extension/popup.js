// popup.js — интерфейс MyNotify: форма создания + список напоминаний.

const STORAGE_KEY = 'reminders';
const DAY_NAMES = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Порядок дней для форм (как в основной форме: Пн…Вс)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

// Варианты звука дублируют <select> основной формы — нужны для инлайн-редактирования
const SOUND_OPTIONS = [
  ['111.mp3', 'Мелодичный'],
  ['222.mp3', 'Сигнал'],
  ['333.mp3', 'Тревога'],
  ['none', 'Без звука'],
];

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

/**
 * Инлайн-форма редактирования напоминания: название, время, дни, звук.
 * Живёт внутри карточки и не использует id основной формы, чтобы не конфликтовать с ней.
 */
function createEditForm(reminder, onSave, onCancel) {
  const form = document.createElement('form');
  form.className = 'editForm';

  const header = document.createElement('strong');
  header.className = 'editHeader';
  header.textContent = '✏️ Редактирование';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'editTitle';
  titleInput.placeholder = 'Название (созвон, обед, задача...)';
  titleInput.maxLength = 50;
  titleInput.autocomplete = 'off';
  titleInput.spellcheck = false;
  titleInput.value = reminder.title || '';

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'editTime';
  timeInput.value = reminder.time || '09:00';

  const timeLabel = document.createElement('label');
  timeLabel.className = 'editField';
  timeLabel.append('Время:', timeInput);

  const soundSelect = document.createElement('select');
  soundSelect.className = 'editSound';
  SOUND_OPTIONS.forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    if (value === reminder.sound) option.selected = true;
    soundSelect.appendChild(option);
  });

  const soundLabel = document.createElement('label');
  soundLabel.className = 'editField';
  soundLabel.append('Звук:', soundSelect);

  const daysBox = document.createElement('div');
  daysBox.className = 'editDays';

  const daysCaption = document.createElement('strong');
  daysCaption.textContent = 'Дни:';
  daysBox.appendChild(daysCaption);

  const currentDays = Array.isArray(reminder.days) ? reminder.days.map(Number) : [];
  DAY_ORDER.forEach((day) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(day);
    checkbox.checked = currentDays.includes(day);
    label.append(checkbox, ` ${DAY_NAMES[day]}`);
    daysBox.appendChild(label);
  });

  const actions = document.createElement('div');
  actions.className = 'editActions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'submit';
  saveBtn.className = 'btnAccept editSave';
  saveBtn.textContent = 'Сохранить';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btnSecondary editCancel';
  cancelBtn.textContent = 'Отмена';
  cancelBtn.addEventListener('click', onCancel);

  actions.append(saveBtn, cancelBtn);

  // submit вместо click — Enter в поле названия тоже сохраняет изменения
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const days = Array.from(daysBox.querySelectorAll('input[type="checkbox"]:checked'))
      .map((checkbox) => Number(checkbox.value));

    if (!title) {
      titleInput.focus();
      return;
    }
    if (days.length === 0) {
      alert('Выберите хотя бы один день');
      return;
    }

    onSave({ title, time: timeInput.value, days, sound: soundSelect.value });
  });

  const topRow = document.createElement('div');
  topRow.className = 'editRow';
  topRow.append(titleInput, timeLabel, soundLabel);

  form.append(header, topRow, daysBox, actions);
  return form;
}

/** Создаёт карточку одного напоминания. */
function createReminderCard(reminder, onToggle, onDelete, onEdit) {
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

  // Деликатное редактирование: маленькая кнопка, форма раскрывается прямо в карточке
  const editBtn = document.createElement('button');
  editBtn.className = 'editBtn';
  editBtn.textContent = '✏️';
  editBtn.title = 'Изменить напоминание';
  editBtn.addEventListener('click', () => {
    card.classList.add('editing');
    card.replaceChildren(
      createEditForm(
        reminder,
        (changes) => onEdit(reminder.id, changes),
        refreshList,
      ),
    );
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'deleteBtn';
  deleteBtn.textContent = 'Удалить';
  deleteBtn.addEventListener('click', () => onDelete(reminder.id));

  actions.append(toggleBtn, editBtn, deleteBtn);

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
    container.appendChild(
      createReminderCard(reminder, toggleReminder, deleteReminder, updateReminder),
    );
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

/**
 * Сохраняет правки карточки: название, время, дни, звук.
 * commit() сам перепланирует алармы и перерисует список.
 */
async function updateReminder(id, changes) {
  const reminders = await loadReminders();
  const reminder = reminders.find((item) => item.id === id);
  if (!reminder) return;

  Object.assign(reminder, changes);
  await commit(reminders);
}

/** Перечитывает список и перерисовывает его (выход из режима редактирования). */
async function refreshList() {
  render(await loadReminders());
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