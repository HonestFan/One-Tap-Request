package com.onetaprequest.app;

import android.app.Application;

import com.onesignal.Continue;
import com.onesignal.OneSignal;

public class ApplicationClass extends Application {
    @Override
    public void onCreate() {
        super.onCreate();

        String appId = getString(getResources().getIdentifier("onesignal_app_id", "string", getPackageName()));
        if (appId == null || appId.trim().isEmpty()) {
            return;
        }

        OneSignal.initWithContext(this, appId);
        OneSignal.getNotifications().requestPermission(false, Continue.none());
    }
}
