// True inside the Android app (Capacitor), false in a browser or installed PWA.
export const isNative = Boolean(window.Capacitor?.isNativePlatform?.());
