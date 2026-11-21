package com.derekgillett.sudoku;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Opens https://sudokucrew.com/play full screen (Trusted Web Activity).
 *
 * Two extras over the stock launcher:
 *  - The first launch after updating from the old native app hands its saved
 *    sign-in to the web app (in the #fragment, never sent to a server), so
 *    players aren't signed out by the update. The old token is then deleted.
 *  - Old native multiplayer links (sudoku.appfoundry.cc/m/CODE) open the
 *    web app's join screen.
 */
public class ShellActivity extends LauncherActivity {
    private static final String WEB = "https://sudokucrew.com/play/";

    @Override
    protected Uri getLaunchingUrl() {
        Uri uri = super.getLaunchingUrl();
        Uri incoming = getIntent() != null ? getIntent().getData() : null;
        if (incoming != null && "sudoku.appfoundry.cc".equals(incoming.getHost())
                && incoming.getPath() != null && incoming.getPath().startsWith("/m/")) {
            String code = incoming.getPath().substring(3).replace("/", "");
            uri = Uri.parse(WEB).buildUpon().appendQueryParameter("join", code).build();
        }
        String token = takeOldToken();
        if (token != null) {
            uri = uri.buildUpon().encodedFragment("signin=" + Uri.encode(token)).build();
        }
        return uri;
    }

    /** The native app's bearer token, once; null if there isn't one. */
    private String takeOldToken() {
        try {
            MasterKey key = new MasterKey.Builder(this)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();
            SharedPreferences prefs = EncryptedSharedPreferences.create(
                    this, "sudoku_secure", key,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
            String token = prefs.getString("api_token", null);
            if (token != null) prefs.edit().remove("api_token").apply();
            return token;
        } catch (Exception e) {
            return null;
        } finally {
            // Nothing else from the native app is needed.
            getSharedPreferences("sudoku_shell", Context.MODE_PRIVATE).edit().putBoolean("migrated", true).apply();
        }
    }
}
