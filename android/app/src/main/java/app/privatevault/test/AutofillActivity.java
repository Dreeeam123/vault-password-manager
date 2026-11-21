package app.privatevault.test;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.autofill.Dataset;
import android.view.WindowManager;
import android.view.autofill.AutofillId;
import android.view.autofill.AutofillManager;
import android.view.autofill.AutofillValue;

import androidx.annotation.RequiresApi;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;

/**
 * Opened by {@link VaultAutofillService}. Runs the same bundled VAULT interface,
 * which detects this activity through AutofillPlugin and shows the login picker.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class AutofillActivity extends BridgeActivity {
    static final String EXTRA_USERNAME_IDS = "app.privatevault.autofill.USERNAME_IDS";
    static final String EXTRA_PASSWORD_IDS = "app.privatevault.autofill.PASSWORD_IDS";
    static final String EXTRA_DOMAIN = "app.privatevault.autofill.DOMAIN";
    static final String EXTRA_PACKAGE = "app.privatevault.autofill.PACKAGE";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        registerPlugin(BackupFilePlugin.class);
        registerPlugin(AppIconPlugin.class);
        registerPlugin(SessionKeyPlugin.class);
        registerPlugin(SecureClipboardPlugin.class);
        registerPlugin(BiometricPlugin.class);
        registerPlugin(AutofillPlugin.class);
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
    }

    String domain() { return getIntent().getStringExtra(EXTRA_DOMAIN); }
    String targetPackage() { return getIntent().getStringExtra(EXTRA_PACKAGE); }

    void complete(String username, String password) {
        ArrayList<AutofillId> usernames = getIntent().getParcelableArrayListExtra(EXTRA_USERNAME_IDS);
        ArrayList<AutofillId> passwords = getIntent().getParcelableArrayListExtra(EXTRA_PASSWORD_IDS);
        Dataset.Builder dataset = new Dataset.Builder(VaultAutofillService.presentation(this));
        boolean any = false;
        if (usernames != null && username != null && !username.isEmpty()) for (AutofillId id : usernames) { dataset.setValue(id, AutofillValue.forText(username)); any = true; }
        if (passwords != null && password != null && !password.isEmpty()) for (AutofillId id : passwords) { dataset.setValue(id, AutofillValue.forText(password)); any = true; }
        if (any) setResult(RESULT_OK, new Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset.build()));
        finish();
    }

    void cancel() {
        setResult(RESULT_CANCELED);
        finish();
    }
}
