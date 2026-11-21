package app.privatevault.test;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.view.autofill.AutofillManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Connects the VAULT interface to the Android autofill framework. */
@CapacitorPlugin(name = "Autofill")
public class AutofillPlugin extends Plugin {
    @PluginMethod
    public void request(PluginCall call) {
        JSObject result = new JSObject();
        Activity activity = getActivity();
        boolean active = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && activity instanceof AutofillActivity;
        result.put("active", active);
        if (active) {
            AutofillActivity autofill = (AutofillActivity) activity;
            String target = autofill.targetPackage();
            result.put("domain", autofill.domain());
            result.put("packageName", target);
            result.put("appName", appName(target));
        }
        call.resolve(result);
    }

    @PluginMethod
    public void fill(PluginCall call) {
        Activity activity = getActivity();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || !(activity instanceof AutofillActivity)) { call.reject("No autofill request is open."); return; }
        String username = call.getString("username", "");
        String password = call.getString("password", "");
        activity.runOnUiThread(() -> ((AutofillActivity) activity).complete(username, password));
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Activity activity = getActivity();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && activity instanceof AutofillActivity) activity.runOnUiThread(() -> ((AutofillActivity) activity).cancel());
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        boolean supported = false, enabled = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AutofillManager manager = getContext().getSystemService(AutofillManager.class);
            supported = manager != null && manager.isAutofillSupported();
            enabled = supported && manager.hasEnabledAutofillServices();
        }
        result.put("supported", supported);
        result.put("enabled", enabled);
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.reject("Autofill needs Android 8 or newer."); return; }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SET_AUTOFILL_SERVICE).setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
        } catch (Exception e) {
            getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
        call.resolve();
    }

    private String appName(String packageName) {
        if (packageName == null) return null;
        try {
            PackageManager manager = getContext().getPackageManager();
            ApplicationInfo info = manager.getApplicationInfo(packageName, 0);
            return manager.getApplicationLabel(info).toString();
        } catch (Exception e) {
            return null;
        }
    }
}
