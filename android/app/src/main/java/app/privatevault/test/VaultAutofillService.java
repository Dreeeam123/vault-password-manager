package app.privatevault.test;

import android.app.PendingIntent;
import android.app.assist.AssistStructure;
import android.content.Intent;
import android.content.IntentSender;
import android.os.Build;
import android.os.CancellationSignal;
import android.service.autofill.AutofillService;
import android.service.autofill.Dataset;
import android.service.autofill.FillCallback;
import android.service.autofill.FillContext;
import android.service.autofill.FillRequest;
import android.service.autofill.FillResponse;
import android.service.autofill.SaveCallback;
import android.service.autofill.SaveRequest;
import android.view.autofill.AutofillId;
import android.widget.RemoteViews;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import java.util.List;

/**
 * Offers a single "Unlock VAULT" suggestion on login forms. The service never sees
 * credentials: tapping the suggestion opens VAULT, where the user unlocks the vault
 * and picks a login. Only that login is handed back to Android to be filled.
 */
@RequiresApi(api = Build.VERSION_CODES.O)
public class VaultAutofillService extends AutofillService {
    @Override
    public void onFillRequest(@NonNull FillRequest request, @NonNull CancellationSignal cancellationSignal, @NonNull FillCallback callback) {
        List<FillContext> contexts = request.getFillContexts();
        if (contexts.isEmpty()) { callback.onSuccess(null); return; }
        AssistStructure structure = contexts.get(contexts.size() - 1).getStructure();
        String packageName = structure.getActivityComponent().getPackageName();
        if (getPackageName().equals(packageName)) { callback.onSuccess(null); return; }
        AutofillFields fields = AutofillFields.parse(structure);
        if (fields.isEmpty()) { callback.onSuccess(null); return; }

        Intent intent = new Intent(this, AutofillActivity.class)
            .putParcelableArrayListExtra(AutofillActivity.EXTRA_USERNAME_IDS, fields.usernames)
            .putParcelableArrayListExtra(AutofillActivity.EXTRA_PASSWORD_IDS, fields.passwords)
            .putExtra(AutofillActivity.EXTRA_DOMAIN, fields.webDomain)
            .putExtra(AutofillActivity.EXTRA_PACKAGE, packageName);
        // The framework adds the assist structure to this intent, so it must stay mutable. It is explicit.
        int flags = PendingIntent.FLAG_CANCEL_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        IntentSender sender = PendingIntent.getActivity(this, request.getId(), intent, flags).getIntentSender();

        Dataset.Builder dataset = new Dataset.Builder(presentation(this));
        for (AutofillId id : fields.usernames) dataset.setValue(id, null);
        for (AutofillId id : fields.passwords) dataset.setValue(id, null);
        dataset.setAuthentication(sender);
        callback.onSuccess(new FillResponse.Builder().addDataset(dataset.build()).build());
    }

    @Override
    public void onSaveRequest(@NonNull SaveRequest request, @NonNull SaveCallback callback) {
        callback.onSuccess();
    }

    static RemoteViews presentation(android.content.Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.autofill_item);
        views.setTextViewText(R.id.autofill_text, context.getString(R.string.autofill_unlock));
        return views;
    }
}
