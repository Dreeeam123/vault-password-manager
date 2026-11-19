package app.privatevault.test;

import android.content.Context;
import android.os.Bundle;
import android.os.PowerManager;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(BackupFilePlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(SessionKeyPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onStop() {
        super.onStop();
        // Disabling the launcher alias we were started from finishes this task, so a pending icon
        // switch is applied only once the user has actually left: not while the system file picker
        // sits on top of us (its result would be lost) and not when the screen merely turned off.
        if (BackupFilePlugin.isPickerOpen()) return;
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power != null && !power.isInteractive()) return;
        AppIconPlugin.applyPending(this);
    }

    @Override
    public void onDestroy() {
        if (isFinishing()) AppIconPlugin.applyPending(this);
        super.onDestroy();
    }
}
