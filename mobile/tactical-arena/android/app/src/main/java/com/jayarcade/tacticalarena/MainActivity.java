package com.jayarcade.tacticalarena;

import android.os.Bundle;
import android.view.View;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (app-module) plugins are not auto-discovered the way packaged
        // Capacitor plugins are, so register before super.onCreate() builds the bridge.
        registerPlugin(PlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
        goFullScreen();
    }

    // Tactical Arena is a landscape game laid out against the full viewport: a visible
    // status bar both steals height from an already-short landscape phone and overlaps
    // the top HUD. Hide the system bars entirely and let the WebView own the whole
    // display, cutout included.
    //
    // BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE is the "sticky immersive" behaviour: a swipe
    // from an edge shows the bars translucently for a moment and they auto-hide again,
    // so the layout never resizes underneath the running match.
    private void goFullScreen() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View decorView = getWindow().getDecorView();
        WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(getWindow(), decorView);
        controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    // The bars come back after a swipe, an IME dismissal, or returning from another app.
    // Re-hiding on focus is what keeps them from lingering for the rest of the session.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            goFullScreen();
        }
    }
}
