package app.privatevault.test;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyStore;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Fingerprint unlock. The vault key is wrapped with an AES-256-GCM Android Keystore key
 * that the hardware only releases after a successful strong biometric check, for that
 * single operation. Enrolling a new fingerprint permanently invalidates the key, so a
 * fingerprint added by someone else can never open the vault.
 */
@CapacitorPlugin(name = "Biometric")
public class BiometricPlugin extends Plugin {
    static final String PREFS = "vault_biometric";
    static final String KEY_WRAPPED = "wrapped";
    static final String KEY_IV = "iv";
    static final String ALIAS = "app.privatevault.biometric-wrap";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int STRONG = BiometricManager.Authenticators.BIOMETRIC_STRONG;

    private interface CipherAction { void run(Cipher cipher) throws Exception; }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", BiometricManager.from(getContext()).canAuthenticate(STRONG) == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("enabled", prefs().contains(KEY_WRAPPED));
        call.resolve(result);
    }

    @PluginMethod
    public void enable(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("Missing key"); return; }
        Cipher cipher;
        try {
            deleteKey();
            cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, createKey());
        } catch (Exception e) {
            clear();
            call.reject("Fingerprint unlock is not available on this device. Make sure a fingerprint is set up.", "UNAVAILABLE", e);
            return;
        }
        prompt(call, cipher, "Turn on fingerprint unlock", "Confirm it's you", authorized -> {
            byte[] raw = Base64.decode(key, Base64.NO_WRAP);
            try {
                byte[] wrapped = authorized.doFinal(raw);
                prefs().edit()
                    .putString(KEY_WRAPPED, Base64.encodeToString(wrapped, Base64.NO_WRAP))
                    .putString(KEY_IV, Base64.encodeToString(authorized.getIV(), Base64.NO_WRAP))
                    .apply();
            } finally { Arrays.fill(raw, (byte) 0); }
            call.resolve();
        });
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        SharedPreferences prefs = prefs();
        String wrapped = prefs.getString(KEY_WRAPPED, null);
        String iv = prefs.getString(KEY_IV, null);
        if (wrapped == null || iv == null) { call.reject("Fingerprint unlock is off.", "NOT_ENABLED"); return; }
        Cipher cipher;
        try {
            SecretKey secret = existingKey();
            if (secret == null) throw new KeyPermanentlyInvalidatedException();
            cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
        } catch (KeyPermanentlyInvalidatedException e) {
            clear();
            call.reject("Your fingerprints changed, so fingerprint unlock was turned off. Use your master password.", "INVALIDATED");
            return;
        } catch (Exception e) {
            call.reject("Fingerprint unlock is not available right now. Use your master password.", "UNAVAILABLE", e);
            return;
        }
        prompt(call, cipher, "Unlock VAULT", "Use your fingerprint", authorized -> {
            byte[] raw = authorized.doFinal(Base64.decode(wrapped, Base64.NO_WRAP));
            JSObject result = new JSObject();
            result.put("key", Base64.encodeToString(raw, Base64.NO_WRAP));
            Arrays.fill(raw, (byte) 0);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        clear();
        call.resolve();
    }

    private void prompt(PluginCall call, Cipher cipher, String title, String subtitle, CipherAction action) {
        getActivity().runOnUiThread(() -> {
            BiometricPrompt prompt = new BiometricPrompt(getActivity(), ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    BiometricPrompt.CryptoObject crypto = result.getCryptoObject();
                    if (crypto == null || crypto.getCipher() == null) { call.reject("Fingerprint check failed.", "FAILED"); return; }
                    try { action.run(crypto.getCipher()); }
                    catch (Exception e) { call.reject("Fingerprint unlock failed. Use your master password.", "FAILED", e); }
                }

                @Override
                public void onAuthenticationError(int code, @NonNull CharSequence message) {
                    boolean cancelled = code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON || code == BiometricPrompt.ERROR_CANCELED;
                    call.reject(message.toString(), cancelled ? "CANCELLED" : "ERROR");
                }
            });
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setNegativeButtonText("Use master password")
                .setAllowedAuthenticators(STRONG)
                .build();
            prompt.authenticate(info, new BiometricPrompt.CryptoObject(cipher));
        });
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private void clear() {
        prefs().edit().clear().apply();
        try { deleteKey(); } catch (Exception ignored) { }
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore;
    }

    private static SecretKey existingKey() throws Exception {
        KeyStore.Entry entry = keyStore().getEntry(ALIAS, null);
        return entry instanceof KeyStore.SecretKeyEntry ? ((KeyStore.SecretKeyEntry) entry).getSecretKey() : null;
    }

    private static void deleteKey() throws Exception {
        KeyStore keyStore = keyStore();
        if (keyStore.containsAlias(ALIAS)) keyStore.deleteEntry(ALIAS);
    }

    private static SecretKey createKey() throws Exception {
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .setInvalidatedByBiometricEnrollment(true);
        // Every use needs a fresh strong biometric; the device PIN alone cannot release it.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) spec.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(spec.build());
        return generator.generateKey();
    }
}
