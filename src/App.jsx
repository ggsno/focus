import { useCallback, useEffect, useRef, useState } from 'react';

const TICK_MS = 250;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function playBeep() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  const ctx = new AudioContextClass();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.5);
  oscillator.onended = () => ctx.close();
}

function vibrate() {
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
}

function phaseLabel(phase) {
  return phase === 'focus' ? '집중' : '휴식';
}

export default function App() {
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [phase, setPhase] = useState('focus');
  const [remainingSeconds, setRemainingSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);

  const endsAtRef = useRef(null);
  const phaseRef = useRef(phase);
  const focusMinutesRef = useRef(focusMinutes);
  const breakMinutesRef = useRef(breakMinutes);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    focusMinutesRef.current = focusMinutes;
  }, [focusMinutes]);

  useEffect(() => {
    breakMinutesRef.current = breakMinutes;
  }, [breakMinutes]);

  const secondsForPhase = useCallback(
    (targetPhase) =>
      (targetPhase === 'focus' ? focusMinutesRef.current : breakMinutesRef.current) * 60,
    [],
  );

  const onPhaseComplete = useCallback(() => {
    playBeep();
    vibrate();

    const nextPhase = phaseRef.current === 'focus' ? 'break' : 'focus';
    const nextSeconds = secondsForPhase(nextPhase);

    phaseRef.current = nextPhase;
    setPhase(nextPhase);
    setRemainingSeconds(nextSeconds);
    endsAtRef.current = Date.now() + nextSeconds * 1000;
  }, [secondsForPhase]);

  const tick = useCallback(() => {
    if (!endsAtRef.current) return;

    const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
    setRemainingSeconds(left);

    if (left === 0) {
      onPhaseComplete();
    }
  }, [onPhaseComplete]);

  useEffect(() => {
    if (!running) return undefined;

    tick();
    const intervalId = window.setInterval(tick, TICK_MS);
    const onVisibilityChange = () => tick();

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [running, tick]);

  const handleFocusMinutesChange = (event) => {
    const minutes = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
    setFocusMinutes(minutes);
    if (!running && phase === 'focus') {
      setRemainingSeconds(minutes * 60);
    }
  };

  const handleBreakMinutesChange = (event) => {
    const minutes = Math.max(1, Number.parseInt(event.target.value, 10) || 1);
    setBreakMinutes(minutes);
    if (!running && phase === 'break') {
      setRemainingSeconds(minutes * 60);
    }
  };

  const handleStart = () => {
    if (running) return;
    endsAtRef.current = Date.now() + remainingSeconds * 1000;
    setRunning(true);
  };

  const handleStop = () => {
    if (running && endsAtRef.current) {
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(left);
    }
    setRunning(false);
    endsAtRef.current = null;
  };

  return (
    <main>
      <h1>뽀모도로</h1>

      <p>
        <label>
          집중 시간(분):
          <input
            type="number"
            min="1"
            step="1"
            value={focusMinutes}
            onChange={handleFocusMinutesChange}
            disabled={running}
          />
        </label>
      </p>

      <p>
        <label>
          휴식 시간(분):
          <input
            type="number"
            min="1"
            step="1"
            value={breakMinutes}
            onChange={handleBreakMinutesChange}
            disabled={running}
          />
        </label>
      </p>

      <p>
        현재: {phaseLabel(phase)} / 남은 시간: {formatTime(remainingSeconds)}
      </p>

      <p>
        <button type="button" onClick={handleStart} disabled={running}>
          시작
        </button>
        <button type="button" onClick={handleStop} disabled={!running}>
          정지
        </button>
      </p>
    </main>
  );
}
