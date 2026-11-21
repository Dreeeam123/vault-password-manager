package app.privatevault.test;

import android.app.assist.AssistStructure;
import android.os.Build;
import android.text.InputType;
import android.view.View;
import android.view.ViewStructure;
import android.view.autofill.AutofillId;

import androidx.annotation.RequiresApi;

import java.util.ArrayList;
import java.util.Locale;

/** Finds the username and password fields of a login form in another app or website. */
@RequiresApi(api = Build.VERSION_CODES.O)
final class AutofillFields {
    enum Kind { USERNAME, PASSWORD, TEXT, IGNORE }

    final ArrayList<AutofillId> usernames = new ArrayList<>();
    final ArrayList<AutofillId> passwords = new ArrayList<>();
    String webDomain;
    private AutofillId lastTextBeforePassword;

    boolean isEmpty() { return usernames.isEmpty() && passwords.isEmpty(); }

    static AutofillFields parse(AssistStructure structure) {
        AutofillFields fields = new AutofillFields();
        for (int i = 0; i < structure.getWindowNodeCount(); i++) fields.visit(structure.getWindowNodeAt(i).getRootViewNode());
        // Many forms only mark the password; the text field right before it is the username.
        if (fields.usernames.isEmpty() && !fields.passwords.isEmpty() && fields.lastTextBeforePassword != null) fields.usernames.add(fields.lastTextBeforePassword);
        return fields;
    }

    private void visit(AssistStructure.ViewNode node) {
        if (node == null) return;
        String domain = node.getWebDomain();
        if (webDomain == null && domain != null && !domain.isEmpty()) webDomain = domain;
        AutofillId id = node.getAutofillId();
        if (id != null && node.getAutofillType() == View.AUTOFILL_TYPE_TEXT && node.getVisibility() == View.VISIBLE) {
            ViewStructure.HtmlInfo html = node.getHtmlInfo();
            String htmlType = null, htmlName = null;
            if (html != null && html.getAttributes() != null) {
                for (android.util.Pair<String, String> attribute : html.getAttributes()) {
                    if ("type".equals(attribute.first)) htmlType = attribute.second;
                    else if ("name".equals(attribute.first) || "id".equals(attribute.first) || "autocomplete".equals(attribute.first)) htmlName = (htmlName == null ? "" : htmlName + " ") + attribute.second;
                }
            }
            CharSequence hint = node.getHint();
            Kind kind = classify(node.getAutofillHints(), node.getInputType(), htmlType, htmlName, node.getIdEntry(), hint == null ? null : hint.toString());
            if (kind == Kind.PASSWORD) passwords.add(id);
            else if (kind == Kind.USERNAME) usernames.add(id);
            else if (kind == Kind.TEXT && passwords.isEmpty()) lastTextBeforePassword = id;
        }
        for (int i = 0; i < node.getChildCount(); i++) visit(node.getChildAt(i));
    }

    static Kind classify(String[] hints, int inputType, String htmlType, String htmlName, String idEntry, String hint) {
        if (hints != null) {
            for (String value : hints) {
                if (value == null) continue;
                String h = value.toLowerCase(Locale.ROOT);
                if (h.contains("otp") || h.contains("sms") || h.contains("creditcard") || h.contains("postal")) return Kind.IGNORE;
                if (h.contains("password")) return Kind.PASSWORD;
                if (h.contains("username") || h.contains("email")) return Kind.USERNAME;
            }
        }
        int inputClass = inputType & InputType.TYPE_MASK_CLASS;
        int variation = inputType & InputType.TYPE_MASK_VARIATION;
        if (inputClass == InputType.TYPE_CLASS_TEXT && (variation == InputType.TYPE_TEXT_VARIATION_PASSWORD || variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD || variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)) return Kind.PASSWORD;
        if (inputClass == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD) return Kind.PASSWORD;
        String type = htmlType == null ? "" : htmlType.toLowerCase(Locale.ROOT);
        if (type.equals("password")) return Kind.PASSWORD;
        if (type.equals("email")) return Kind.USERNAME;
        if (!type.isEmpty() && !type.equals("text") && !type.equals("tel")) return Kind.IGNORE;
        String words = (nullToEmpty(htmlName) + " " + nullToEmpty(idEntry) + " " + nullToEmpty(hint)).toLowerCase(Locale.ROOT);
        if (words.contains("search") || words.contains("captcha") || words.contains("code")) return Kind.IGNORE;
        if (words.contains("pass") || words.contains("pwd") || words.contains("kennwort")) return Kind.PASSWORD;
        if (inputClass == InputType.TYPE_CLASS_TEXT && (variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS || variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS)) return Kind.USERNAME;
        if (words.contains("user") || words.contains("mail") || words.contains("login") || words.contains("account") || words.contains("benutzer") || words.contains("phone")) return Kind.USERNAME;
        return Kind.TEXT;
    }

    private static String nullToEmpty(String value) { return value == null ? "" : value; }
}
