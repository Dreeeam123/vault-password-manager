package app.privatevault.test;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.os.Build;
import android.os.PersistableBundle;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Copies secrets with the "sensitive" flag, so Android 13+ hides the value in the
 * clipboard preview and keyboards do not suggest it. Writing an empty string clears
 * the clipboard instead of leaving an empty clip behind.
 */
@CapacitorPlugin(name = "SecureClipboard")
public class SecureClipboardPlugin extends Plugin {
    private static final String EXTRA_IS_SENSITIVE_COMPAT = "android.content.extra.IS_SENSITIVE";

    @PluginMethod
    public void write(PluginCall call) {
        String text = call.getString("text", "");
        ClipboardManager clipboard = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) { call.reject("Clipboard unavailable"); return; }
        try {
            if (text == null || text.isEmpty()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) clipboard.clearPrimaryClip();
                else clipboard.setPrimaryClip(ClipData.newPlainText("", ""));
                call.resolve();
                return;
            }
            ClipData clip = ClipData.newPlainText("Vault", text);
            PersistableBundle extras = new PersistableBundle();
            String key = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                ? ClipDescription.EXTRA_IS_SENSITIVE
                : EXTRA_IS_SENSITIVE_COMPAT;
            extras.putBoolean(key, true);
            clip.getDescription().setExtras(extras);
            clipboard.setPrimaryClip(clip);
            call.resolve();
        } catch (Exception e) {
            call.reject("Clipboard access was blocked", e);
        }
    }
}
