# Capacitor discovers plugins and their @PluginMethod handlers via reflection.
-keep public class * extends com.getcapacitor.Plugin
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
    @com.getcapacitor.annotation.PermissionCallback <methods>;
    @com.getcapacitor.annotation.ActivityCallback <methods>;
}
-keep @com.getcapacitor.annotation.CapacitorPlugin public class *

# Launcher aliases are referenced from the manifest only.
-keep class app.privatevault.test.MainActivity { *; }

# The WebView bridge calls into these through JavascriptInterface.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Strip debug logging from release builds.
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}
