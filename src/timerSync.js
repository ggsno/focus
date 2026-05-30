export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.register('/sw.js', {
    scope: '/',
  });
  await navigator.serviceWorker.ready;
  return registration;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

export async function postTimerMessage(payload) {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active ?? navigator.serviceWorker.controller;
  worker?.postMessage(payload);
}

export function subscribeTimerState(onState) {
  if (!('serviceWorker' in navigator)) return () => {};

  const handler = (event) => {
    if (event.data?.type === 'TIMER_STATE') {
      onState(event.data.state);
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}

export function remainingSecondsFromState(state) {
  if (!state) return 0;

  if (state.running && state.endsAt) {
    return Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  }

  if (typeof state.remainingSeconds === 'number') {
    return state.remainingSeconds;
  }

  return (state.phase === 'focus' ? state.focusMinutes : state.breakMinutes) * 60;
}

export function buildTimerState({
  focusMinutes,
  breakMinutes,
  phase,
  remainingSeconds,
  running,
}) {
  return {
    focusMinutes,
    breakMinutes,
    phase,
    remainingSeconds,
    running,
    endsAt: running ? Date.now() + remainingSeconds * 1000 : null,
  };
}
