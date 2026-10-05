import type { CameraMode } from '../cameras';

export interface HudHandlers {
  onCamera: (mode: CameraMode) => void;
  onNextTime: () => void;
  onTogglePause: () => void;
}

export interface Hud {
  setCamera: (mode: CameraMode) => void;
  setClock: (hours: number, paused: boolean) => void;
  toggle: () => void;
}

const LABELS: Record<CameraMode, string> = {
  overview: '1 · Toàn cảnh',
  follow: '2 · Theo tàu',
  window: '3 · Cửa sổ toa',
};

export function createHud(root: HTMLElement, h: HudHandlers): Hud {
  root.innerHTML = `
    <div class="window-frame" aria-hidden="true"></div>
    <div class="hud-title">
      <h1>Đèo Hải Vân</h1>
      <p>Thiên hạ đệ nhất hùng quan</p>
    </div>
    <div class="hud-bar">
      <div class="hud-cams">
        ${(Object.keys(LABELS) as CameraMode[])
          .map((m) => `<button type="button" data-cam="${m}">${LABELS[m]}</button>`)
          .join('')}
      </div>
      <div class="hud-time">
        <button type="button" data-act="time" title="T">🕒 <span class="clock">13:00</span></button>
        <button type="button" data-act="pause" title="Space">⏸</button>
      </div>
    </div>
    <p class="hud-help">Kéo để xoay · Cuộn để zoom · 1/2/3 đổi góc · T đổi giờ · Space tạm dừng · H ẩn</p>
  `;
  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    if (btn.dataset.cam) h.onCamera(btn.dataset.cam as CameraMode);
    else if (btn.dataset.act === 'time') h.onNextTime();
    else if (btn.dataset.act === 'pause') h.onTogglePause();
  });

  const clock = root.querySelector('.clock') as HTMLElement;
  const pauseBtn = root.querySelector('[data-act="pause"]') as HTMLElement;

  return {
    setCamera(mode) {
      root.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) => {
        b.classList.toggle('active', b.dataset.cam === mode);
      });
      root.classList.toggle('mode-window', mode === 'window');
    },
    setClock(hours, paused) {
      const hh = Math.floor(hours) % 24;
      const mm = Math.floor((hours % 1) * 60);
      clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      pauseBtn.textContent = paused ? '▶' : '⏸';
    },
    toggle() {
      root.classList.toggle('hidden');
    },
  };
}
