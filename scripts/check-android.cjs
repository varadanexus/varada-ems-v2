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
const layout = read("new-ems/shared/layout.js");
const dashboard = read("new-ems/shared/page-dashboard.js");
const nativeUpdate = read("new-ems/shared/native-app-update.js");
const filePaths = read("android/app/src/main/res/xml/file_paths.xml");
const login = read("login.html");
const releaseWorkflow = read(".github/workflows/android-release.yml");
const androidStrings = read("android/app/src/main/res/values/strings.xml");

assert(config.appId === "com.varadanexus.ems", "Unexpected Android application ID.");
assert(config.appName === "Varada Nexus", "Capacitor app name must use the Varada Nexus brand.");
assert(config.webDir === "native-www", "Capacitor must use the isolated native web bundle.");
assert(!config.server?.url, "Production Android builds must not be a remote website wrapper.");
assert(manifest.includes("android:allowBackup=\"false\""), "Android backups must be disabled for authenticated EMS data.");
assert(manifest.includes("android:usesCleartextTraffic=\"false\""), "Cleartext network traffic must be disabled.");
assert(manifest.includes("android.permission.USE_BIOMETRIC"), "Biometric permission is missing.");
assert(manifest.includes("android.permission.POST_NOTIFICATIONS"), "Android notification permission is missing.");
assert(manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES"), "Android in-app update installation permission is missing.");
assert(androidStrings.includes('<string name="app_name">Varada Nexus</string>'), "Android launcher name must be Varada Nexus.");
assert(activity.includes("registerPlugin(NativeDevicePlugin.class)"), "Native device bridge is not registered.");
assert(nativeDevice.includes("BiometricPrompt"), "Native biometric prompt implementation is missing.");
assert(nativeDevice.includes('.setTitle("Varada Nexus")'), "Native biometric prompts must use the Varada Nexus brand.");
assert(nativeDevice.includes("requestPermissionForAlias(\"notifications\""), "Native notification permission request is missing.");
assert(nativeDevice.includes("public void downloadAndInstallUpdate"), "Native signed-update download bridge is missing.");
assert(nativeDevice.includes("verifyDownloadedApk"), "Native updater must verify the downloaded APK before installation.");
assert(nativeDevice.includes("getApkContentsSigners"), "Native updater must compare APK signing certificates.");
assert(nativeDevice.includes("ACTION_MANAGE_UNKNOWN_APP_SOURCES"), "Native updater must handle Android install-source permission.");
assert(nativeDevice.includes('"github.com".equalsIgnoreCase(host)'), "Native update downloads must be restricted to the official release host.");
assert(filePaths.includes('path="updates/"') && !filePaths.includes("external-path"), "APK sharing must be limited to the private update cache.");
assert(gradle.includes("androidx.biometric:biometric"), "AndroidX biometric dependency is missing.");
assert(gradle.includes("ANDROID_KEYSTORE_PATH"), "Release signing must be configured from protected environment secrets.");
assert(deviceSecurity.includes("Plugins?.NativeDevice"), "Web security gate is not connected to native biometrics.");
assert(pushNotifications.includes("requestNotifications()"), "Web notification gate is not connected to Android permission.");
assert(pwa.includes("if (isNative()) return;"), "Native builds must not register the browser service worker.");
assert(layout.includes('const saved = isMobile() ? "closed"'), "Mobile module drawers must start closed.");
assert(layout.includes('if (sidebar?.contains(anchor)) closeMobileSidebar();'), "Mobile module drawers must close after navigation selection.");
assert(dashboard.includes('.cc-admin-grid{grid-template-columns:1fr;'), "Mobile administration cards must use a readable single-column layout.");
assert(dashboard.includes('.cc-user{width:100%;max-width:100%;min-width:0;'), "Mobile command-center identity cards must not exceed their parent card.");
assert(dashboard.includes('.cc-actions{display:grid;width:100%;max-width:100%;min-width:0;'), "Mobile command-center actions must use a bounded grid.");
assert(nativeUpdate.includes("releases/latest"), "Native app must check the latest signed Android release.");
assert(nativeUpdate.includes('title: "Update available"'), "Native app must show a mandatory update prompt.");
assert(nativeUpdate.includes('downloadAndInstallUpdate'), "Mandatory update prompt must use the native in-app installer.");
assert(nativeUpdate.includes('updateDownloadProgress'), "Mandatory update prompt must show native download progress.");
assert(nativeUpdate.includes("compareVersions(installed, latest) < 0"), "Outdated native apps must remain blocked.");
assert(nativeUpdate.includes('title: "Connection required"'), "Native app must fail closed when update verification is unavailable.");
assert(layout.includes("await enforceNativeAppUpdate()"), "Protected modules must enforce the native app version gate.");
assert(login.includes("await enforceNativeAppUpdate()"), "Native login must enforce the app version gate.");
assert(login.includes("releases/latest/download/Varada-EMS.apk"), "Public login must link to the latest signed Android APK.");
assert(releaseWorkflow.includes("assembleRelease"), "Signed release workflow must build the release APK.");
assert(releaseWorkflow.includes("build-tools/36.0.0/apksigner") && releaseWorkflow.includes("verify --verbose --print-certs"), "Signed release workflow must verify the APK signature.");
assert(releaseWorkflow.includes("softprops/action-gh-release"), "Signed APK must be published to a permanent GitHub Release.");

if (!process.exitCode) console.log("Android validation passed: native bundle, biometrics, permissions, and security guards are present.");
