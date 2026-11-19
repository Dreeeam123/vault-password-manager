package app.privatevault.test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.Set;
import org.junit.Test;

/** Keeps the alias list in AppIconPlugin, the manifest and lib/app-icons.json in sync. */
public class AppIconPluginTest {
    private static String read(String relative) throws Exception {
        File file = new File(System.getProperty("user.dir"), relative);
        if (!file.exists()) file = new File(System.getProperty("user.dir"), "../" + relative);
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    @Test
    public void everyAliasIsDeclaredInTheManifestExactlyOnce() throws Exception {
        String manifest = read("app/src/main/AndroidManifest.xml");
        Set<String> seen = new HashSet<>();
        for (String alias : AppIconPlugin.ALIASES) {
            String needle = "android:name=\"." + alias + "\"";
            int first = manifest.indexOf(needle);
            assertTrue("Missing alias " + alias, first >= 0);
            assertEquals("Duplicate alias " + alias, -1, manifest.indexOf(needle, first + 1));
            assertTrue("Duplicate in plugin list " + alias, seen.add(alias));
        }
        assertEquals(AppIconPlugin.ALIASES.length, manifest.split("<activity-alias ").length - 1);
    }

    @Test
    public void onlyTheDefaultAliasStartsEnabled() throws Exception {
        String manifest = read("app/src/main/AndroidManifest.xml");
        for (String alias : AppIconPlugin.ALIASES) {
            int start = manifest.indexOf("android:name=\"." + alias + "\"");
            String tag = manifest.substring(start, manifest.indexOf(">", start));
            boolean enabled = tag.contains("android:enabled=\"true\"");
            assertEquals(alias, AppIconPlugin.DEFAULT_ALIAS.equals(alias), enabled);
            assertFalse(alias + " must not be exported privately", tag.contains("android:exported=\"false\""));
        }
    }

    @Test
    public void webPaletteMatchesPluginAliases() throws Exception {
        String palette = read("../lib/app-icons.json");
        for (String alias : AppIconPlugin.ALIASES) assertTrue("lib/app-icons.json lacks " + alias, palette.contains("\"" + alias + "\""));
        assertEquals(AppIconPlugin.ALIASES.length, palette.split("\"alias\"").length - 1);
        assertTrue(AppIconPlugin.isKnown(AppIconPlugin.DEFAULT_ALIAS));
        assertFalse(AppIconPlugin.isKnown("LauncherUnknown"));
    }
}
