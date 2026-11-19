// Only active inside the Android and iOS apps (Capacitor). In a browser, isNative is false and nothing here runs.
// Schedules a notification at each prayer time, worked out by app.js, for the coming days.
import { Capacitor, registerPlugin } from "./vendor/capacitor-core-8.5.3.min.js";

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // "android", "ios" or "web"
const LN = isNative ? registerPlugin("LocalNotifications") : null;

// iOS keeps at most 64 waiting notifications per app, so we schedule up to 60 and top them up
// every time the app is opened.
export const LIMIT = 60;
export const MAX_DAYS = 14;
// Android 8+ fixes a notification's sound by its channel, so there is one channel per sound.
export const SOUNDS = {
  chime: { name: "Chime", channel: "athan-chime", file: "chime.wav" },
  system: { name: "Phone's sound", channel: "athan-system" }
};

let channelsReady = null;
function ensureChannels() {
  if (platform !== "android") return Promise.resolve();
  if (!channelsReady) channelsReady = Promise.all(Object.values(SOUNDS).map(s => LN.createChannel({
    id: s.channel, name: "Prayer times · " + s.name, description: "A notification at the start of each prayer time",
    importance: 5, visibility: 1, vibration: true, ...(s.file ? { sound: s.file } : {})
  }))).catch(e => { channelsReady = null; throw e; });
  return channelsReady;
}

// Permission to show notifications: "granted", "denied" or "prompt".
export async function permission() {
  if (!isNative) return "unsupported";
  try { return (await LN.checkPermissions()).display; } catch (e) { return "denied"; }
}
export async function requestPermission() {
  try { return (await LN.requestPermissions()).display; } catch (e) { return "denied"; }
}
// Android 12+: whether notifications can arrive exactly on time ("granted") or may be a few minutes late.
export async function exactAlarms() {
  if (platform !== "android") return "granted";
  try { return (await LN.checkExactNotificationSetting()).exact_alarm; } catch (e) { return "granted"; }
}
export async function openExactAlarmSetting() {
  try { await LN.changeExactNotificationSetting(); } catch (e) {}
}

// events: [{ id, at: Date, title, body }] in time order. Replaces everything scheduled before.
// Returns the number scheduled.
const TEST_ID = 1; // a test notification is left alone when the prayer notifications are replaced
async function cancelPrayers() {
  const pending = ((await LN.getPending()).notifications || []).filter(n => n.id !== TEST_ID);
  if (pending.length) await LN.cancel({ notifications: pending.map(n => ({ id: n.id })) });
}
export async function schedule(events, sound) {
  if (!isNative) return 0;
  await cancelPrayers();
  const now = Date.now();
  const list = events.filter(e => e.at.getTime() > now + 5000).slice(0, LIMIT);
  if (!list.length) return 0;
  await ensureChannels();
  const s = SOUNDS[sound] || SOUNDS.chime;
  await LN.schedule({
    notifications: list.map(e => ({
      id: e.id, title: e.title, body: e.body,
      schedule: { at: e.at, allowWhileIdle: true },
      // iOS plays no sound unless one is named; a name it can't find plays the phone's default sound.
      sound: s.file || "default",
      channelId: s.channel,
      smallIcon: "ic_stat_prayer", iconColor: "#1f5a4b",
      autoCancel: true,
      extra: { prayer: e.prayer }
    }))
  });
  return list.length;
}

export async function cancelAll() {
  if (isNative) await cancelPrayers();
}

// Sends one notification with the chosen sound, a few seconds from now.
export async function test(sound, title, body, seconds = 3) {
  await ensureChannels();
  const s = SOUNDS[sound] || SOUNDS.chime;
  await LN.schedule({ notifications: [{ id: TEST_ID, title, body, schedule: { at: new Date(Date.now() + seconds * 1000), allowWhileIdle: true },
    sound: s.file || "default", channelId: s.channel, smallIcon: "ic_stat_prayer", iconColor: "#1f5a4b", autoCancel: true }] });
}

// Opening the app from a notification goes to the prayer times.
export function onOpened(fn) {
  if (!isNative) return;
  try { Promise.resolve(LN.addListener("localNotificationActionPerformed", a => fn(a.notification))).catch(() => {}); } catch (e) {}
}
