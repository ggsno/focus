import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildTimerState,
  postTimerMessage,
  registerServiceWorker,
  remainingSecondsFromState,
  requestNotificationPermission,
  subscribeTimerState,
} from './timerSync.js';

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
  const [notificationHint, setNotificationHint] = useState('');

  const endsAtRef = useRef(null);
  const phaseRef = useRef(phase);
  const runningRef = useRef(running);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  const applyState = useCallback((state) => {
    if (!state) return;

    const phaseChanged = runningRef.current && state.running && phaseRef.current !== state.phase;

    setFocusMinutes(state.focusMinutes);
    setBreakMinutes(state.breakMinutes);
    setPhase(state.phase);
    setRunning(Boolean(state.running));
    endsAtRef.current = state.running ? state.endsAt : null;
    setRemainingSeconds(remainingSecondsFromState(state));

    if (phaseChanged) {
      playBeep();
      vibrate();
    }
  }, []);

  useEffect(() => {
    registerServiceWorker().then(() => postTimerMessage({ type: 'GET_STATE' }));
    return subscribeTimerState(applyState);
  }, [applyState]);

  useEffect(() => {
    if (!running || !endsAtRef.current) return undefined;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000));
      setRemainingSeconds(left);
    };

    tick();
    const intervalId = window.setInterval(tick, TICK_MS);

    const onVisibilityChange = () => {
      postTimerMessage({ type: 'GET_STATE' });
      tick();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [running]);

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

  const handleStart = async () => {
    if (running) return;

    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      setNotificationHint('알림 권한이 필요합니다. 브라우저 설정에서 알림을 허용해 주세요.');
      return;
    }

    setNotificationHint('');

    const state = buildTimerState({
      focusMinutes,
      breakMinutes,
      phase,
      remainingSeconds,
      running: true,
    });

    endsAtRef.current = state.endsAt;
    setRunning(true);
    await postTimerMessage({ type: 'START', state });
  };

  const handleStop = async () => {
    const left =
      running && endsAtRef.current
        ? Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
        : remainingSeconds;

    const state = buildTimerState({
      focusMinutes,
      breakMinutes,
      phase,
      remainingSeconds: left,
      running: false,
    });

    endsAtRef.current = null;
    setRemainingSeconds(left);
    setRunning(false);
    await postTimerMessage({ type: 'STOP', state });
  };

  return (
    <main>
      <h1>뽀모도로</h1>

      <p>
        안드로이드: Chrome에서 홈 화면에 추가하고 알림을 허용하면, 화면이 꺼져 있어도
        타이머가 진행되고 알림이 옵니다.
      </p>
      {notificationHint ? <p>{notificationHint}</p> : null}

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
