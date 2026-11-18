package com.varadanexus.ems;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeDevicePlugin.class);
        registerPlugin(SmsOtpPlugin.class);
        super.onCreate(savedInstanceState);
        configureOperationalNotificationChannel();
        configureTrustedWebCache();
    }

    private void configureOperationalNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            getString(R.string.default_notification_channel_id),
            "EMS operational alerts",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Operational, security and workflow alerts from Varada Nexus EMS.");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setShowBadge(true);
        manager.createNotificationChannel(channel);
    }

    private void configureTrustedWebCache() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookies.setAcceptThirdPartyCookies(webView, false);
        }
    }
}
