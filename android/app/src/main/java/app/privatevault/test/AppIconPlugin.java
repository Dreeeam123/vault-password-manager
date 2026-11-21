package app.privatevault.test;

import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Switches the launcher icon by enabling exactly one of the activity-alias entries in the manifest.
 * Aliases live in the app's own namespace, so this works regardless of applicationId suffixes.
 *
 * Android finishes the current task as soon as the alias it was launched from is disabled, which
 * would throw the user out of the app. The switch is therefore only recorded here and applied by
 * MainActivity once the app has moved to the background, where the restart is invisible.
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
    static final String[] ALIASES = {
        "LauncherClassic", "LauncherGlass", "LauncherGradient", "LauncherMidnight", "LauncherForest",
        "LauncherRose", "LauncherMono", "LauncherOcean", "LauncherAmber"
    };
    static final String DEFAULT_ALIAS = "LauncherMono";
    private static final String PREFS = "launcher_icon";
    private static final String PENDING = "pending_alias";

    static boolean isKnown(String alias) {
        for (String candidate : ALIASES) if (candidate.equals(alias)) return true;
        return false;
    }

    static ComponentName component(Context context, String alias) {
        return new ComponentName(context, "app.privatevault.test." + alias);
    }

    static String current(Context context) {
        PackageManager manager = context.getPackageManager();
        for (String alias : ALIASES) {
            int state = manager.getComponentEnabledSetting(component(context, alias));
            boolean enabled = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && DEFAULT_ALIAS.equals(alias));
            if (enabled) return alias;
        }
        return DEFAULT_ALIAS;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String pending(Context context) {
        String alias = prefs(context).getString(PENDING, null);
        return alias != null && isKnown(alias) ? alias : null;
    }

    static void schedule(Context context, String alias) {
        prefs(context).edit().putString(PENDING, alias).apply();
    }

    /** The alias the launcher will show once any pending switch has been applied. */
    static String effective(Context context) {
        String pending = pending(context);
        return pending != null ? pending : current(context);
    }

    static void apply(Context context, String alias) {
        PackageManager manager = context.getPackageManager();
        // Enable the new alias first so the app never disappears from the launcher in between.
        manager.setComponentEnabledSetting(component(context, alias), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        for (String other : ALIASES) {
            if (other.equals(alias)) continue;
            manager.setComponentEnabledSetting(component(context, other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
    }

    /** Applies a recorded switch. Call only while the app is in the background. Returns true if the icon changed. */
    static boolean applyPending(Context context) {
        String alias = pending(context);
        if (alias == null) return false;
        prefs(context).edit().remove(PENDING).apply();
        if (alias.equals(current(context))) return false;
        apply(context, alias);
        return true;
    }

    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("alias", effective(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String alias = call.getString("alias");
        if (alias == null || !isKnown(alias)) {
            call.reject("Unknown launcher icon");
            return;
        }
        Context context = getContext();
        boolean deferred = false;
        if (alias.equals(current(context))) {
            prefs(context).edit().remove(PENDING).apply();
        } else if (!alias.equals(pending(context))) {
            schedule(context, alias);
            deferred = true;
        }
        JSObject result = new JSObject();
        result.put("alias", alias);
        result.put("deferred", deferred);
        call.resolve(result);
    }
}
