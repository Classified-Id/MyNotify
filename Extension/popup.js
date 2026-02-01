function playSound(soundFile, volume = 0.5) {
  if (soundFile === 'none') return;

  try {
    const soundPath = chrome.runtime.getURL(`./sounds/${soundFile}`);
    console.log('soundPath:', soundPath);
    const audio = new Audio(soundPath);
    audio.volume = volume / 100; // преобразуем 0-100 в 0-1
    audio.play();

    audio.onended = () => console.log('Звук завершен');
    audio.onerror = (e) => console.error('Ошибка воспроизведения:', e);

  } catch (error) {
    console.error('Ошибка загрузки звука:', error);
  }
}

async function sendNotificationWithSound(title, message) {
  const soundFile = document.getElementById('soundSelect').value;
  const volume = document.getElementById('volumeSlider').value;

  if (soundFile !== 'none') {
    playSound(soundFile, volume);
  }

  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }

  if (Notification.permission === 'granted') {
    new Notification(title, {
      body: message,
      icon: 'icons/icon48.png',
      silent: true
    });
  }
}

document.getElementById('volumeSlider').addEventListener('input', (e) => {
  document.getElementById('volumeValue').textContent = `${e.target.value}%`;
});

document.getElementById('testSound').addEventListener('click', () => {
  const soundFile = document.getElementById('soundSelect').value;
  const volume = document.getElementById('volumeSlider').value;

  if (soundFile !== 'none') {
    playSound(soundFile, volume);
  } else {
    alert('Выберите звук для теста');
  }
});

document.getElementById('sendNotification').addEventListener('click', () => {
  sendNotificationWithSound('MyNotify', 'Тестовое уведомление со звуком!');
});

function scheduleNotification() {
  setTimeout(() => {
    sendNotificationWithSound('Напоминание', 'Пора сделать перерыв!');
  }, 5000); // через 5 секунд
}

// Запускаем по желанию
// scheduleNotification();
