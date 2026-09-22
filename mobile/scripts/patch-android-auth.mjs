import fs from 'node:fs';

const manifestPath = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);
let manifest = fs.readFileSync(manifestPath, 'utf8');

const marker = '<!-- READSAENGGI_OAUTH_DEEPLINK -->';
if (!manifest.includes(marker)) {
  const activityName = 'android:name=".MainActivity"';
  const activityIndex = manifest.indexOf(activityName);
  if (activityIndex < 0) {
    throw new Error('MainActivity not found in AndroidManifest.xml');
  }

  const activityClose = manifest.indexOf('</activity>', activityIndex);
  if (activityClose < 0) {
    throw new Error('MainActivity closing tag not found');
  }

  const deepLink = `
            ${marker}
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data
                    android:scheme="com.bokdoong.read"
                    android:host="auth"
                    android:pathPrefix="/callback" />
            </intent-filter>
`;

  manifest = manifest.slice(0, activityClose) + deepLink + manifest.slice(activityClose);
  fs.writeFileSync(manifestPath, manifest);
}


const shareMarker = '<!-- READSAENGGI_SHARE_TARGET -->';
if (!manifest.includes(shareMarker)) {
  const activityName = 'android:name=".MainActivity"';
  const activityIndex = manifest.indexOf(activityName);
  if (activityIndex < 0) throw new Error('MainActivity not found for share target');

  const activityClose = manifest.indexOf('</activity>', activityIndex);
  if (activityClose < 0) throw new Error('MainActivity closing tag not found for share target');

  const shareFilter = `
            ${shareMarker}
            <intent-filter>
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="text/plain" />
            </intent-filter>
`;

  manifest = manifest.slice(0, activityClose) + shareFilter + manifest.slice(activityClose);
  fs.writeFileSync(manifestPath, manifest);
}

const mainActivityPath = new URL('../android/app/src/main/java/com/bokdoong/read/MainActivity.java', import.meta.url);
let mainActivity = fs.readFileSync(mainActivityPath, 'utf8');

if (!mainActivity.includes('READSAENGGI_SHARE_HANDLER')) {
  mainActivity = `package com.bokdoong.read;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {
    // READSAENGGI_SHARE_HANDLER
    private static final Pattern URL_PATTERN = Pattern.compile("(https?://\\\\S+)");
    private static final String APP_ROOT = "https://read.bokdoong.com/";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleSharedIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleSharedIntent(intent);
    }

    private void handleSharedIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;

        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (sharedText == null || sharedText.isBlank()) return;

        Matcher matcher = URL_PATTERN.matcher(sharedText);
        if (!matcher.find()) return;

        String sharedUrl = matcher.group(1).replaceAll("[)\\]}>.,;!?]+$", "");
        if (sharedUrl.isBlank()) return;
        String targetUrl = APP_ROOT + "?share=" + Uri.encode(sharedUrl);

        getBridge().getWebView().post(() -> getBridge().getWebView().loadUrl(targetUrl));
    }
}
`;
  fs.writeFileSync(mainActivityPath, mainActivity);
}
