package app.privatevault.test;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Gives the app access to exactly one user-chosen file (for example in Google Drive or a
 * Syncthing folder). Only encrypted Vault envelopes can be written to it.
 */
@CapacitorPlugin(name = "SyncFile")
public class SyncFilePlugin extends Plugin {
    private static final String PREFS = "vault-sync";
    private static final String KEY = "uri";
    private static final int ACCESS = Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private Uri current() {
        String value = prefs().getString(KEY, null);
        return value == null ? null : Uri.parse(value);
    }

    private String nameOf(Uri uri) {
        try (android.database.Cursor cursor = getContext().getContentResolver().query(uri,
                new String[] { android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) return cursor.getString(0);
        } catch (Exception ignored) {
        }
        return "Sync file";
    }

    @PluginMethod
    public void status(PluginCall call) {
        Uri uri = current();
        JSObject response = new JSObject();
        response.put("name", uri == null ? null : nameOf(uri));
        call.resolve(response);
    }

    @PluginMethod
    public void choose(PluginCall call) {
        boolean create = Boolean.TRUE.equals(call.getBoolean("create", true));
        Intent intent = new Intent(create ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(create ? "application/octet-stream" : "*/*");
        if (create) intent.putExtra(Intent.EXTRA_TITLE, "vault-sync.vault");
        intent.addFlags(ACCESS | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            BackupFilePlugin.pickerOpen = true;
            startActivityForResult(call, intent, "chosen");
        } catch (Exception error) {
            BackupFilePlugin.pickerOpen = false;
            call.reject("Could not open the file picker.");
        }
    }

    @ActivityCallback
    private void chosen(PluginCall call, ActivityResult result) {
        BackupFilePlugin.pickerOpen = false;
        if (call == null) return;
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, ACCESS);
        } catch (SecurityException error) {
            call.reject("This location cannot be used for sync. Choose a file in a synced folder, such as Google Drive.");
            return;
        }
        release(current());
        prefs().edit().putString(KEY, uri.toString()).apply();
        JSObject response = new JSObject();
        response.put("cancelled", false);
        response.put("name", nameOf(uri));
        call.resolve(response);
    }

    @PluginMethod
    public void read(PluginCall call) {
        Uri uri = current();
        if (uri == null) {
            call.reject("No sync file chosen.");
            return;
        }
        getBridge().execute(() -> {
            try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
                JSObject response = new JSObject();
                if (stream == null) {
                    response.put("text", null);
                    call.resolve(response);
                    return;
                }
                ByteArrayOutputStream output = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (output.size() + count > 20_000_000) {
                        call.reject("The sync file is larger than 20 MB.");
                        return;
                    }
                    output.write(buffer, 0, count);
                }
                response.put("text", new String(output.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(response);
            } catch (FileNotFoundException error) {
                JSObject response = new JSObject();
                response.put("text", null);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("The sync file could not be read. Check that the folder is still available.");
            }
        });
    }

    @PluginMethod
    public void write(PluginCall call) {
        Uri uri = current();
        String data = call.getString("data");
        if (uri == null || data == null || !BackupFilePlugin.isEncryptedBackup(data)) {
            call.reject("Only an encrypted vault can be written to the sync file.");
            return;
        }
        getBridge().execute(() -> {
            byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
            try {
                writeWith(uri, "wt", bytes);
                call.resolve();
            } catch (Exception truncateUnsupported) {
                // Some document providers (cloud drives) only accept "w", which also replaces the content.
                try {
                    writeWith(uri, "w", bytes);
                    call.resolve();
                } catch (Exception error) {
                    call.reject("The sync file could not be saved. Check that the folder is still available.");
                }
            }
        });
    }

    private void writeWith(Uri uri, String mode, byte[] bytes) throws Exception {
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, mode)) {
            if (stream == null) throw new IllegalStateException("Sync file unavailable");
            stream.write(bytes);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        release(current());
        prefs().edit().remove(KEY).apply();
        call.resolve();
    }

    private void release(Uri uri) {
        if (uri == null) return;
        try {
            getContext().getContentResolver().releasePersistableUriPermission(uri, ACCESS);
        } catch (Exception ignored) {
        }
    }
}
