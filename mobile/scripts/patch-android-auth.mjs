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
