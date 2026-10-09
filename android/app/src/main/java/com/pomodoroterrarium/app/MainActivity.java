package com.pomodoroterrarium.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleTasksAuthPlugin.class);   // the app's own plugin, for Google Tasks sync
        super.onCreate(savedInstanceState);
    }
}
