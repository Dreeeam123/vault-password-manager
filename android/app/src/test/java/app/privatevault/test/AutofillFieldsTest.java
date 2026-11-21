package app.privatevault.test;

import static org.junit.Assert.assertEquals;

import android.text.InputType;

import org.junit.Test;

public class AutofillFieldsTest {
    private static final int TEXT = InputType.TYPE_CLASS_TEXT;

    @Test
    public void autofillHintsWin() {
        assertEquals(AutofillFields.Kind.PASSWORD, AutofillFields.classify(new String[] { "password" }, TEXT, null, null, null, null));
        assertEquals(AutofillFields.Kind.USERNAME, AutofillFields.classify(new String[] { "emailAddress" }, TEXT, null, null, null, null));
        assertEquals(AutofillFields.Kind.IGNORE, AutofillFields.classify(new String[] { "smsOTPCode" }, TEXT, null, null, null, null));
    }

    @Test
    public void passwordInputTypes() {
        assertEquals(AutofillFields.Kind.PASSWORD, AutofillFields.classify(null, TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD, null, null, null, null));
        assertEquals(AutofillFields.Kind.PASSWORD, AutofillFields.classify(null, TEXT | InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD, null, null, null, null));
        assertEquals(AutofillFields.Kind.USERNAME, AutofillFields.classify(null, TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS, null, null, null, null));
    }

    @Test
    public void webForms() {
        assertEquals(AutofillFields.Kind.PASSWORD, AutofillFields.classify(null, 0, "password", "pw", null, null));
        assertEquals(AutofillFields.Kind.USERNAME, AutofillFields.classify(null, 0, "email", null, null, null));
        assertEquals(AutofillFields.Kind.USERNAME, AutofillFields.classify(null, 0, "text", "login_user", null, null));
        assertEquals(AutofillFields.Kind.IGNORE, AutofillFields.classify(null, 0, "checkbox", "remember", null, null));
        assertEquals(AutofillFields.Kind.IGNORE, AutofillFields.classify(null, 0, "text", "q search", null, null));
        assertEquals(AutofillFields.Kind.TEXT, AutofillFields.classify(null, 0, "text", "first_name", null, null));
    }

    @Test
    public void nativeViewIdsAndHints() {
        assertEquals(AutofillFields.Kind.USERNAME, AutofillFields.classify(null, TEXT, null, null, "username_field", null));
        assertEquals(AutofillFields.Kind.PASSWORD, AutofillFields.classify(null, TEXT, null, null, null, "Passwort"));
        assertEquals(AutofillFields.Kind.IGNORE, AutofillFields.classify(null, TEXT, null, null, "verification_code", null));
    }
}
