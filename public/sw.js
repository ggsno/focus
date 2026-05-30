const CACHE_NAME = 'pomodoro-timer-v1';
const STATE_URL = '/__timer_state__';
const NOTIFICATION_TAG = 'pomodoro-phase';

let timeoutId = null;

function phaseMessage(phase) {
  if (phase === 'focus') {
    return { title: '집중 끝', body: '휴식 시간입니다.' };
  }
  return { title: '휴식 끝', body: '집중 시간입니다.' };
}

async function loadState() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(STATE_URL);
  if (!response) return null;
  return response.json();
}

async function saveState(state) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put(STATE_URL, new Response(JSON.stringify(state)));
}

async function broadcastState(state) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  clients.forEach((client) => {
    client.postMessage({ type: 'TIMER_STATE', state });
  });
}

async function cancelScheduled() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  const notifications = await self.registration.getNotifications({ tag: NOTIFICATION_TAG });
  notifications.forEach((notification) => notification.close());
}

async function showPhaseNotification(phase) {
  const { title, body } = phaseMessage(phase);
  await self.registration.showNotification(title, {
    body,
    tag: NOTIFICATION_TAG,
    renotify: true,
    vibrate: [200, 100, 200],
    silent: false,
  });
}

function nextPhaseState(state) {
  const nextPhase = state.phase === 'focus' ? 'break' : 'focus';
  const durationSeconds =
    (nextPhase === 'focus' ? state.focusMinutes : state.breakMinutes) * 60;

  return {
    ...state,
    phase: nextPhase,
    running: true,
    endsAt: Date.now() + durationSeconds * 1000,
  };
}

async function schedulePhaseEnd(state) {
  await cancelScheduled();

  if (!state?.running || !state.endsAt) return;

  const delay = state.endsAt - Date.now();
  if (delay <= 0) return;

  // showTrigger는 미지원 환경에서 알림이 즉시 뜨는 버그가 있어 사용하지 않음
  timeoutId = setTimeout(() => {
    handlePhaseEnd();
  }, Math.min(delay, 2147483647));
}

async function catchUpState(state) {
  let current = state;
  let notified = false;

  while (current?.running && current.endsAt && Date.now() >= current.endsAt) {
    if (!notified) {
      await showPhaseNotification(current.phase);
      notified = true;
    }
    current = nextPhaseState(current);
    await saveState(current);
  }

  return current;
}

async function handlePhaseEnd() {
  const current = await loadState();
  if (!current?.running || !current.endsAt) return;
  if (Date.now() < current.endsAt - 500) return;

  await showPhaseNotification(current.phase);

  const updated = nextPhaseState(current);
  await saveState(updated);
  await schedulePhaseEnd(updated);
  await broadcastState(updated);
}

async function restoreRunningTimer() {
  const state = await loadState();
  if (!state?.running || !state.endsAt) return;

  const caughtUp = await catchUpState(state);
  await schedulePhaseEnd(caughtUp);
  await broadcastState(caughtUp);
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      await restoreRunningTimer();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const { type, state } = event.data ?? {};

  if (type === 'START' || type === 'STOP') {
    event.waitUntil(
      (async () => {
        await saveState(state);
        if (type === 'START') {
          await schedulePhaseEnd(state);
        } else {
          await cancelScheduled();
        }
        await broadcastState(state);
        event.source?.postMessage({ type: 'TIMER_STATE', state });
      })(),
    );
    return;
  }

  if (type === 'GET_STATE') {
    event.waitUntil(
      (async () => {
        const saved = await loadState();
        event.source?.postMessage({ type: 'TIMER_STATE', state: saved });
      })(),
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      if (clients.length > 0) {
        await clients[0].focus();
        return;
      }

      await self.clients.openWindow('/');
    })(),
  );
});
