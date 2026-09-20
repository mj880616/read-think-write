package com.bokdoong.read;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.TextView;

public class MainActivity extends Activity {
    private static final String START_URL = "https://read.bokdoong.com/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(START_URL));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
            finish();
        } catch (ActivityNotFoundException error) {
            TextView message = new TextView(this);
            message.setText("읽생기를 열 수 있는 브라우저가 없습니다. Chrome 또는 기본 브라우저를 설치한 뒤 다시 실행해주세요.");
            message.setTextSize(16);
            message.setTextColor(Color.DKGRAY);
            message.setGravity(Gravity.CENTER);
            message.setPadding(48, 48, 48, 48);
            setContentView(message);
        }
    }
}
