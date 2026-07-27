package com.jayarcade.tacticalarena;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (app-module) plugins are not auto-discovered the way packaged
        // Capacitor plugins are, so register before super.onCreate() builds the bridge.
        registerPlugin(PlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
