package app.privatevault.test;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class SessionKeyPluginTest {
    @Test
    public void zeroMeansNeverExpires() {
        assertFalse(SessionKeyPlugin.isExpired(0, Long.MAX_VALUE));
    }

    @Test
    public void expiresExactlyAtDeadline() {
        assertFalse(SessionKeyPlugin.isExpired(1_000, 999));
        assertTrue(SessionKeyPlugin.isExpired(1_000, 1_000));
        assertTrue(SessionKeyPlugin.isExpired(1_000, 5_000));
    }
}
