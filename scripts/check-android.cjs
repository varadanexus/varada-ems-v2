const fs = require("node:fs");

const read = (file) => fs.readFileSync(file, "utf8");
const assert = (condition, message) => {
  if (!condition) {
    console.error(`Android validation failed: ${message}`);
    process.exitCode = 1;
  }
};

const config = JSON.parse(read("capacitor.config.json"));
const manifest = read("android/app/src/main/AndroidManifest.xml");
const activity = read("android/app/src/main/java/com/varadanexus/ems/MainActivity.java");
const nativeDevice = read("android/app/src/main/java/com/varadanexus/ems/NativeDevicePlugin.java");
const gradle = read("android/app/build.gradle");
const deviceSecurity = read("new-ems/shared/device-security.js");
const pushNotifications = read("new-ems/shared/push-notifications.js");
const pwa = read("new-ems/shared/pwa.js");
const releaseWorkflow = read(".github/workflows/android-release.yml");

assert(config.appId === "com.varadanexus.ems", "Unexpected Android application ID.");
assert(config.webDir === "native-www", "Capacitor must use the isolated native web bundle.");
assert(!config.server?.url, "Production Android builds must not be a remote website wrapper.");
assert(manifest.includes("android:allowBackup=\"false\""), "Android backups must be disabled for authenticated EMS data.");
assert(manifest.includes("android:usesCleartextTraffic=\"false\""), "Cleartext network traffic must be disabled.");
assert(manifest.includes("android.permission.USE_BIOMETRIC"), "Biometric permission is missing.");
assert(manifest.includes("android.permission.POST_NOTIFICATIONS"), "Android notification permission is missing.");
assert(activity.includes("registerPlugin(NativeDevicePlugin.class)"), "Native device bridge is not registered.");
assert(nativeDevice.includes("BiometricPrompt"), "Native biometric prompt implementation is missing.");
assert(nativeDevice.includes("requestPermissionForAlias(\"notifications\""), "Native notification permission request is missing.");
assert(gradle.includes("androidx.biometric:biometric"), "AndroidX biometric dependency is missing.");
assert(gradle.includes("ANDROID_KEYSTORE_PATH"), "Release signing must be configured from protected environment secrets.");
assert(deviceSecurity.includes("Plugins?.NativeDevice"), "Web security gate is not connected to native biometrics.");
assert(pushNotifications.includes("requestNotifications()"), "Web notification gate is not connected to Android permission.");
assert(pwa.includes("if (isNative()) return;"), "Native builds must not register the browser service worker.");
assert(releaseWorkflow.includes("assembleRelease"), "Signed release workflow must build the release APK.");
assert(releaseWorkflow.includes("build-tools/36.0.0/apksigner") && releaseWorkflow.includes("verify --verbose --print-certs"), "Signed release workflow must verify the APK signature.");
assert(releaseWorkflow.includes("softprops/action-gh-release"), "Signed APK must be published to a permanent GitHub Release.");

if (!process.exitCode) console.log("Android validation passed: native bundle, biometrics, permissions, and security guards are present.");
