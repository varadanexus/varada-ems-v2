package com.varadanexus.ems;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.Executor;

@CapacitorPlugin(
    name = "NativeDevice",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeDevicePlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final long MAX_UPDATE_BYTES = 100L * 1024L * 1024L;
    private static final int MAX_REDIRECTS = 6;
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK |
        BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean updateDownloadActive = new AtomicBoolean(false);

    @PluginMethod
    public void downloadAndInstallUpdate(PluginCall call) {
        String url = call.getString("url", "");
        if (!isTrustedUpdateUrl(url, true)) {
            call.reject("Only the official signed Varada EMS update can be downloaded.", "UNTRUSTED_URL");
            return;
        }
        if (!updateDownloadActive.compareAndSet(false, true)) {
            call.reject("An EMS update is already downloading.", "UPDATE_IN_PROGRESS");
            return;
        }

        updateExecutor.execute(() -> {
            File partial = null;
            try {
                File updateDirectory = new File(getContext().getCacheDir(), "updates");
                if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                    throw new UpdateException("Could not prepare secure update storage.", "UPDATE_STORAGE_FAILED");
                }
                partial = new File(updateDirectory, "Varada-EMS.apk.part");
                File apk = new File(updateDirectory, "Varada-EMS.apk");
                if (partial.exists() && !partial.delete()) {
                    throw new UpdateException("Could not clear an incomplete update.", "UPDATE_STORAGE_FAILED");
                }
                if (apk.exists() && !apk.delete()) {
                    throw new UpdateException("Could not replace the previous update.", "UPDATE_STORAGE_FAILED");
                }

                emitUpdateProgress("starting", 0, 0, 0);
                downloadUpdate(url, partial);
                emitUpdateProgress("verifying", 100, partial.length(), partial.length());
                verifyDownloadedApk(partial);
                if (!partial.renameTo(apk)) {
                    throw new UpdateException("Could not finalize the downloaded update.", "UPDATE_STORAGE_FAILED");
                }
                getActivity().runOnUiThread(() -> requestInstallPermissionOrLaunch(call, apk));
            } catch (UpdateException error) {
                if (partial != null) partial.delete();
                call.reject(error.getMessage(), error.code, error);
            } catch (Exception error) {
                if (partial != null) partial.delete();
                call.reject("The signed EMS update could not be downloaded.", "UPDATE_DOWNLOAD_FAILED", error);
            } finally {
                updateDownloadActive.set(false);
            }
        });
    }

    private void downloadUpdate(String initialUrl, File destination) throws Exception {
        URL currentUrl = new URL(initialUrl);
        HttpURLConnection connection = null;
        for (int redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
            if (!isTrustedUpdateUrl(currentUrl.toString(), redirect == 0)) {
                throw new UpdateException("The update server redirected to an untrusted location.", "UNTRUSTED_REDIRECT");
            }
            connection = (HttpURLConnection) currentUrl.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept", APK_MIME);
            connection.setRequestProperty("User-Agent", "Varada-EMS-Android");
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.trim().isEmpty()) {
                    throw new UpdateException("The update server returned an invalid redirect.", "UPDATE_DOWNLOAD_FAILED");
                }
                currentUrl = new URL(currentUrl, location);
                continue;
            }
            if (status != HttpURLConnection.HTTP_OK) {
                connection.disconnect();
                throw new UpdateException("The update server returned " + status + ".", "UPDATE_DOWNLOAD_FAILED");
            }
            break;
        }
        if (connection == null || connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
            if (connection != null) connection.disconnect();
            throw new UpdateException("The update server redirected too many times.", "UPDATE_DOWNLOAD_FAILED");
        }

        long total = connection.getContentLengthLong();
        if (total > MAX_UPDATE_BYTES) {
            connection.disconnect();
            throw new UpdateException("The update file is unexpectedly large.", "UPDATE_TOO_LARGE");
        }

        long downloaded = 0;
        int lastPercent = -1;
        try (
            BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
            BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(destination))
        ) {
            byte[] buffer = new byte[32 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) {
                downloaded += count;
                if (downloaded > MAX_UPDATE_BYTES) {
                    throw new UpdateException("The update file is unexpectedly large.", "UPDATE_TOO_LARGE");
                }
                output.write(buffer, 0, count);
                int percent = total > 0 ? (int) Math.min(99, (downloaded * 100L) / total) : 0;
                if (percent != lastPercent) {
                    emitUpdateProgress("downloading", percent, downloaded, total);
                    lastPercent = percent;
                }
            }
            output.flush();
        } finally {
            connection.disconnect();
        }
        if (downloaded <= 0) {
            throw new UpdateException("The update download was empty.", "UPDATE_DOWNLOAD_FAILED");
        }
    }

    private boolean isTrustedUpdateUrl(String value, boolean requireReleasePath) {
        try {
            Uri uri = Uri.parse(value);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null) return false;
            if (requireReleasePath) {
                return "github.com".equalsIgnoreCase(host) &&
                    "/varadanexus/varada-ems-v2/releases/latest/download/Varada-EMS.apk".equals(uri.getPath());
            }
            return "github.com".equalsIgnoreCase(host) || "release-assets.githubusercontent.com".equalsIgnoreCase(host);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void verifyDownloadedApk(File apk) throws Exception {
        PackageManager packageManager = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo current = packageManager.getPackageInfo(getContext().getPackageName(), flags);
        PackageInfo candidate = packageManager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (candidate == null || !getContext().getPackageName().equals(candidate.packageName)) {
            throw new UpdateException("The downloaded file is not a Varada EMS update.", "UPDATE_PACKAGE_MISMATCH");
        }
        if (packageVersionCode(candidate) <= packageVersionCode(current)) {
            throw new UpdateException("The downloaded APK is not newer than this installation.", "UPDATE_VERSION_INVALID");
        }
        Set<String> currentSignatures = signatureDigests(current);
        Set<String> candidateSignatures = signatureDigests(candidate);
        if (currentSignatures.isEmpty() || candidateSignatures.isEmpty() || !currentSignatures.equals(candidateSignatures)) {
            throw new UpdateException("The downloaded update signature is invalid.", "UPDATE_SIGNATURE_INVALID");
        }
    }

    @SuppressWarnings("deprecation")
    private long packageVersionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private Set<String> signatureDigests(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (info.signingInfo == null) return new HashSet<>();
            signatures = info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        Set<String> digests = new HashSet<>();
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        if (signatures != null) {
            for (Signature signature : signatures) {
                digests.add(Arrays.toString(digest.digest(signature.toByteArray())));
                digest.reset();
            }
        }
        return digests;
    }

    private void requestInstallPermissionOrLaunch(PluginCall call, File apk) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            emitUpdateProgress("permission", 100, apk.length(), apk.length());
            Intent settings = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            startActivityForResult(call, settings, "installPermissionResult");
            return;
        }
        launchInstaller(call, apk);
    }

    @ActivityCallback
    private void installPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        File apk = new File(new File(getContext().getCacheDir(), "updates"), "Varada-EMS.apk");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Installation permission was not enabled for Varada EMS.", "INSTALL_PERMISSION_DENIED");
            return;
        }
        launchInstaller(call, apk);
    }

    private void launchInstaller(PluginCall call, File apk) {
        try {
            if (!apk.isFile()) throw new UpdateException("The downloaded update is no longer available.", "UPDATE_FILE_MISSING");
            Uri apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk
            );
            Intent installer = new Intent(Intent.ACTION_VIEW);
            installer.setDataAndType(apkUri, APK_MIME);
            installer.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            emitUpdateProgress("installing", 100, apk.length(), apk.length());
            getActivity().startActivity(installer);
            JSObject response = new JSObject();
            response.put("installerOpened", true);
            call.resolve(response);
        } catch (UpdateException error) {
            call.reject(error.getMessage(), error.code, error);
        } catch (Exception error) {
            call.reject("Android could not open the update installer.", "INSTALLER_UNAVAILABLE", error);
        }
    }

    private void emitUpdateProgress(String stage, int percent, long downloadedBytes, long totalBytes) {
        JSObject progress = new JSObject();
        progress.put("stage", stage);
        progress.put("percent", percent);
        progress.put("downloadedBytes", downloadedBytes);
        progress.put("totalBytes", totalBytes);
        getActivity().runOnUiThread(() -> notifyListeners("updateDownloadProgress", progress));
    }

    private static class UpdateException extends Exception {
        final String code;

        UpdateException(String message, String code) {
            super(message);
            this.code = code;
        }
    }

    @PluginMethod
    public void biometricStatus(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        JSObject response = new JSObject();
        response.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        response.put("status", result);
        call.resolve(response);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        int availability = BiometricManager.from(getContext()).canAuthenticate(AUTHENTICATORS);
        if (availability != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("Set up fingerprint, face recognition, or a device screen lock in Android Settings first.", "BIOMETRIC_UNAVAILABLE");
            return;
        }

        String reason = call.getString("reason", "Unlock Varada EMS");
        Executor executor = ContextCompat.getMainExecutor(getContext());
        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(
                getActivity(),
                executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        JSObject response = new JSObject();
                        response.put("verified", true);
                        response.put("authenticationType", result.getAuthenticationType());
                        call.resolve(response);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errorMessage) {
                        call.reject(errorMessage.toString(), "BIOMETRIC_CANCELLED", null, new JSObject().put("errorCode", errorCode));
                    }
                }
            );

            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Varada EMS")
                .setSubtitle(reason)
                .setAllowedAuthenticators(AUTHENTICATORS)
                .setConfirmationRequired(false)
                .build();
            prompt.authenticate(promptInfo);
        });
    }

    @PluginMethod
    public void notificationStatus(PluginCall call) {
        resolveNotificationStatus(call);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            resolveNotificationStatus(call);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionResult");
    }

    @PermissionCallback
    private void notificationPermissionResult(PluginCall call) {
        resolveNotificationStatus(call);
    }

    private void resolveNotificationStatus(PluginCall call) {
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            getPermissionState("notifications") == PermissionState.GRANTED;
        JSObject response = new JSObject();
        response.put("granted", granted);
        call.resolve(response);
    }
}
