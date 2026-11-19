package app.privatevault.test;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Remembers the unlocked vault key across app restarts when the user's lock
 * settings allow it. The key never touches disk in the clear: it is wrapped with
 * an AES-256-GCM key that lives in the Android Keystore (hardware-backed where
 * available) and can only be unwrapped by this app on this device.
 */
@CapacitorPlugin(name = "SessionKey")
public class SessionKeyPlugin extends Plugin {
    static final String PREFS = "vault_session";
    static final String KEY_WRAPPED = "wrapped";
    static final String KEY_IV = "iv";
    static final String KEY_EXPIRES = "expiresAt";
    static final String ALIAS = "app.privatevault.session-wrap";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";

    @PluginMethod
    public void store(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("Missing key"); return; }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, wrappingKey());
            byte[] wrapped = cipher.doFinal(Base64.decode(key, Base64.NO_WRAP));
            prefs().edit()
                .putString(KEY_WRAPPED, Base64.encodeToString(wrapped, Base64.NO_WRAP))
                .putString(KEY_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putLong(KEY_EXPIRES, expiresAt(call))
                .apply();
            call.resolve();
        } catch (Exception e) {
            clearPrefs();
            call.reject("Could not remember session", e);
        }
    }

    @PluginMethod
    public void touch(PluginCall call) {
        if (prefs().contains(KEY_WRAPPED)) prefs().edit().putLong(KEY_EXPIRES, expiresAt(call)).apply();
        call.resolve();
    }

    @PluginMethod
    public void load(PluginCall call) {
        JSObject result = new JSObject();
        SharedPreferences prefs = prefs();
        String wrapped = prefs.getString(KEY_WRAPPED, null);
        String iv = prefs.getString(KEY_IV, null);
        long expiresAt = prefs.getLong(KEY_EXPIRES, 0);
        if (wrapped == null || iv == null || isExpired(expiresAt, System.currentTimeMillis())) {
            clearPrefs();
            result.put("key", JSObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, wrappingKey(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            byte[] raw = cipher.doFinal(Base64.decode(wrapped, Base64.NO_WRAP));
            result.put("key", Base64.encodeToString(raw, Base64.NO_WRAP));
            java.util.Arrays.fill(raw, (byte) 0);
        } catch (Exception e) {
            // Keystore reset (e.g. lock screen removed) or tampering: fall back to the password.
            clearPrefs();
            result.put("key", JSObject.NULL);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        clearPrefs();
        call.resolve();
    }

    static boolean isExpired(long expiresAt, long now) {
        return expiresAt > 0 && now >= expiresAt;
    }

    private long expiresAt(PluginCall call) {
        Double value = call.getDouble("expiresAt");
        return value == null ? 0 : value.longValue();
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void clearPrefs() {
        prefs().edit().clear().apply();
    }

    private SecretKey wrappingKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        KeyStore.Entry entry = keyStore.getEntry(ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }
}
