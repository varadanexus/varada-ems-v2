package com.varadanexus.ems;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.phone.SmsRetriever;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Status;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "SmsOtp")
public class SmsOtpPlugin extends Plugin {
    private static final Pattern SIX_DIGIT_CODE = Pattern.compile("(?<!\\d)(\\d{6})(?!\\d)");
    private BroadcastReceiver receiver;
    private boolean receiverRegistered = false;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (!SmsRetriever.SMS_RETRIEVED_ACTION.equals(intent.getAction())) return;
                Bundle extras = intent.getExtras();
                if (extras == null) return;
                Status status = (Status) extras.get(SmsRetriever.EXTRA_STATUS);
                if (status == null) return;
                if (status.getStatusCode() == CommonStatusCodes.SUCCESS) {
                    String message = extras.getString(SmsRetriever.EXTRA_SMS_MESSAGE, "");
                    Matcher matcher = SIX_DIGIT_CODE.matcher(message);
                    if (matcher.find()) {
                        JSObject result = new JSObject();
                        result.put("code", matcher.group(1));
                        notifyListeners("otpReceived", result, true);
                    }
                } else if (status.getStatusCode() == CommonStatusCodes.TIMEOUT) {
                    notifyListeners("otpTimeout", new JSObject(), false);
                }
            }
        };
        IntentFilter filter = new IntentFilter(SmsRetriever.SMS_RETRIEVED_ACTION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter, SmsRetriever.SEND_PERMISSION, null);
        }
        receiverRegistered = true;
    }

    @Override
    protected void handleOnDestroy() {
        if (receiverRegistered && receiver != null) {
            try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
            receiverRegistered = false;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        SmsRetriever.getClient(getActivity()).startSmsRetriever()
            .addOnSuccessListener(unused -> call.resolve(new JSObject().put("listening", true)))
            .addOnFailureListener(error -> call.reject("Android OTP detection could not start.", "SMS_RETRIEVER_UNAVAILABLE", error));
    }

    @PluginMethod
    public void getAppHash(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("hash", calculateAppHash());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Could not calculate the Android SMS verification signature.", "APP_HASH_UNAVAILABLE", error);
        }
    }

    @SuppressWarnings("deprecation")
    private String calculateAppHash() throws Exception {
        String packageName = getContext().getPackageName();
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? PackageManager.GET_SIGNING_CERTIFICATES
            : PackageManager.GET_SIGNATURES;
        PackageInfo info = getContext().getPackageManager().getPackageInfo(packageName, flags);
        Signature[] signatures = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
            ? info.signingInfo.getApkContentsSigners()
            : info.signatures;
        if (signatures == null || signatures.length == 0) throw new IllegalStateException("Signing certificate unavailable");
        String appInfo = packageName + " " + signatures[0].toCharsString();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(appInfo.getBytes(StandardCharsets.UTF_8));
        byte[] truncated = new byte[9];
        System.arraycopy(digest, 0, truncated, 0, truncated.length);
        String encoded = Base64.encodeToString(truncated, Base64.NO_PADDING | Base64.NO_WRAP);
        return encoded.substring(0, 11);
    }
}
