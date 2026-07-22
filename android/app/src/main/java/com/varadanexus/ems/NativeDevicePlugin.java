package com.varadanexus.ems;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.concurrent.Executor;

@CapacitorPlugin(
    name = "NativeDevice",
    permissions = {
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class NativeDevicePlugin extends Plugin {
    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK |
        BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        Uri uri = Uri.parse(url);
        String host = uri.getHost();
        boolean trusted = "https".equalsIgnoreCase(uri.getScheme()) &&
            ("github.com".equalsIgnoreCase(host) || "www.varadanexus.com".equalsIgnoreCase(host));
        if (!trusted) {
            call.reject("Only the official Varada EMS update location can be opened.", "UNTRUSTED_URL");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("No browser is available to download the EMS update.", "BROWSER_UNAVAILABLE", error);
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
