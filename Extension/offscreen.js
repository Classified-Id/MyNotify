/**
 * Offscreen document — «уши» расширения в Manifest V3.
 *
 * Service worker не имеет доступа к Audio API, поэтому звук напоминаний
 * проигрывается здесь, а управление идёт через chrome.runtime.onMessage:
 *   playSound — начать воспроизведение (файл из sounds/ или fallback-бип)
 *   stopSound — прервать текущее воспроизведение (например, юзер закрыл уведомление)
 */

// Одновременно звучит максимум один источник — это позволяет
// останавливать «то, что играет сейчас», не отслеживая отдельные id.
let currentAudio = null;   // HTMLAudioElement для mp3-файла
let currentContext = null; // AudioContext для fallback-бипа

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'playSound') {
    playSound(message.soundFile);
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'stopSound') {
    stopSound();
    sendResponse({ success: true });
    return true;
  }

  return false;
});

/**
 * Воспроизвести звук.
 * @param {string | null | undefined} soundFile - имя mp3 в sounds/; null/undefined/'none' → стандартный бип
 */
function playSound(soundFile) {
  // Новый звук не должен накладываться на предыдущий
  stopSound();

  if (soundFile && soundFile !== 'none') {
    const audio = new Audio(chrome.runtime.getURL(`sounds/${soundFile}`));
    audio.volume = 0.7;
    // Файл может не загрузиться — тогда страхуемся бипом
    audio.play().catch(() => playBeep());
    currentAudio = audio;
    return;
  }

  playBeep();
}

/**
 * Остановить всё, что сейчас звучит (mp3 и/или fallback-бип).
 */
function stopSound() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  if (currentContext) {
    // close() освобождает аудио-поток; результат можно не ждать
    currentContext.close().catch(() => {});
    currentContext = null;
  }
}

/**
 * Fallback: короткий бип на Web Audio API, если mp3 недоступен.
 */
function playBeep() {
  try {
    const actx = new AudioContext();
    const osc = actx.createOscillator();
    const gain = actx.createGain();

    osc.connect(gain);
    gain.connect(actx.destination);

    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, actx.currentTime + 0.5);

    osc.start();
    osc.stop(actx.currentTime + 0.5);
    osc.onended = () => {
      actx.close().catch(() => {});
      if (currentContext === actx) currentContext = null;
    };

    currentContext = actx;
  } catch {
    // Web Audio недоступен — молча сдаёмся, уведомление всё равно покажется
  }
}