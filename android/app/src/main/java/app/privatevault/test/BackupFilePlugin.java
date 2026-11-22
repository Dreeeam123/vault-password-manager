package app.privatevault.test;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackupFile")
public class BackupFilePlugin extends Plugin {
    /** True while a system document picker launched from here is on top of the app. */
    private static volatile boolean pickerOpen = false;

    static boolean isPickerOpen() {
        return pickerOpen;
    }

    @PluginMethod
    public void open(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // .vault files are commonly reported as octet-stream or without a MIME type.
        // Validate their content in the app rather than filtering them out here.
        intent.setType("*/*");
        try {
            pickerOpen = true;
            startActivityForResult(call, intent, "openedBackup");
        } catch (Exception error) {
            pickerOpen = false;
            call.reject("Could not open the file picker. Your vault has not changed.");
        }
    }

    @ActivityCallback
    private void openedBackup(PluginCall call, ActivityResult result) {
        pickerOpen = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("cancelled", true);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            call.reject("No backup file was selected.");
            return;
        }
        getBridge().execute(() -> {
            try (java.io.InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
                if (stream == null) throw new IllegalStateException("File unavailable");
                String name = "Selected backup.vault";
                try (android.database.Cursor cursor = getContext().getContentResolver().query(uri,
                        new String[] { android.provider.OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                    if (cursor != null && cursor.moveToFirst() && !cursor.isNull(0)) name = cursor.getString(0);
                }
                java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (output.size() + count > 20_000_000) {
                        call.reject("Backup must be smaller than 20 MB.");
                        return;
                    }
                    output.write(buffer, 0, count);
                }
                JSObject response = new JSObject();
                response.put("cancelled", false);
                response.put("name", name);
                response.put("size", output.size());
                response.put("text", new String(output.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Backup could not be read. Try copying it to Downloads first. Your vault has not changed.");
            }
        });
    }

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String name = call.getString("fileName");
        if (data == null || name == null || !name.matches("vault-[0-9T-]+\\.vault") || !isEncryptedBackup(data)) {
            call.reject("Only encrypted Vault backups can be saved.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/octet-stream");
        intent.putExtra(Intent.EXTRA_TITLE, name);
        try {
            pickerOpen = true;
            startActivityForResult(call, intent, "savedLocation");
        } catch (Exception error) {
            pickerOpen = false;
            call.reject("Could not open the file picker. Your vault has not changed.");
        }
    }

    static boolean isEncryptedBackup(String data) {
        if (data.length() > 20_000_000) return false;
        try {
            org.json.JSONObject envelope = new org.json.JSONObject(data);
            boolean argon2 = envelope.length() == 10
                && envelope.getInt("version") == 2
                && "Argon2id".equals(envelope.getString("kdf"))
                && envelope.getInt("memory") == 65536
                && envelope.getInt("iterations") == 3
                && envelope.getInt("parallelism") == 4;
            boolean legacy = envelope.length() == 8
                && envelope.getInt("version") == 1
                && "PBKDF2-SHA256".equals(envelope.getString("kdf"))
                && envelope.getInt("iterations") == 600000;
            return (argon2 || legacy)
                && "vault".equals(envelope.getString("format"))
                && "AES-256-GCM".equals(envelope.getString("cipher"))
                && envelope.getString("salt").matches("[A-Za-z0-9+/]{22}==")
                && envelope.getString("iv").matches("[A-Za-z0-9+/]{16}")
                && envelope.getString("ciphertext").matches("[A-Za-z0-9+/]{22,}={0,2}");
        } catch (org.json.JSONException error) {
            return false;
        }
    }

    @ActivityCallback
    private void savedLocation(PluginCall call, ActivityResult result) {
        pickerOpen = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK) {
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        Uri uri = result.getData() == null ? null : result.getData().getData();
        if (uri == null) {
            call.reject("No backup location was selected.");
            return;
        }
        // Provider writes may be slow; keep them off the Android UI thread.
        getBridge().execute(() -> {
            try {
                String data = call.getString("data");
                if (data == null) throw new IllegalStateException("Missing backup");
                try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (stream == null) throw new IllegalStateException("Location unavailable");
                    stream.write(data.getBytes(StandardCharsets.UTF_8));
                    stream.flush();
                }
                JSObject response = new JSObject();
                response.put("saved", true);
                call.resolve(response);
            } catch (Exception error) {
                call.reject("Backup could not be saved. Try another folder; your vault has not changed.");
            }
        });
    }
}
