/**
 * Offscreen document для воспроизведения звука в MV3.
 * Service worker не имеет доступа к Audio API, поэтому
 * звук проигрывается здесь через chrome.runtime.onMessage.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'playSound') {
    playSound(message.soundFile);
    sendResponse({success: true});
    return true;
  }
  return false;
});

/**
 * Воспроизвести звуковой файл.
 * @param {string | undefined} soundFile - имя файла в sounds/ (mp3), или undefined для стандартного beep
 */
function playSound(soundFile) {
  try {
    if (soundFile && soundFile !== 'none') {
      const soundPath = chrome.runtime.getURL(`sounds/${soundFile}`);
      const audio = new Audio(soundPath);
      audio.volume = 0.7;
      audio.play().catch(() => playBeep());
    } else {
      playBeep();
    }
  } catch {
    playBeep();
  }
}

/**
 * Fallback: генерация звука через Web Audio API.
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
    osc.onended = () => actx.close();
  } catch {
    // последний рубеж — ничего не делаем
  }
}