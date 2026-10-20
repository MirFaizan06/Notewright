package app.notewright;

import android.content.Context;
import android.os.Build;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Remembers why the app stopped, so the next launch can show it and the user can report it. */
final class CrashReporter {
    private static final String FILE = "last-crash.txt";

    private CrashReporter() { }

    static void install(Context app) {
        final Context ctx = app.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                StringWriter sw = new StringWriter();
                error.printStackTrace(new PrintWriter(sw));
                record(ctx, "Crash on thread " + thread.getName() + "\n" + sw);
            } catch (Throwable ignored) { }
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    /** Appends a report (kept short) with device details. */
    static void record(Context ctx, String what) {
        try {
            String text = what.length() > 6000 ? what.substring(0, 6000) : what;
            String info = "Notewright " + versionName(ctx) + " | Android " + Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ") | "
                    + Build.MANUFACTURER + " " + Build.MODEL + "\n";
            File f = new File(ctx.getFilesDir(), FILE);
            try (FileOutputStream out = new FileOutputStream(f, true)) {
                out.write((info + text + "\n\n").getBytes(StandardCharsets.UTF_8));
            }
        } catch (Throwable ignored) { }
    }

    /** Returns and clears the stored report, or null when there is none. */
    static String takePending(Context ctx) {
        try {
            File f = new File(ctx.getFilesDir(), FILE);
            if (!f.exists()) return null;
            String s = new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8).trim();
            f.delete();
            return s.isEmpty() ? null : s;
        } catch (Throwable t) {
            return null;
        }
    }

    private static String versionName(Context ctx) {
        try { return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName; } catch (Throwable t) { return "?"; }
    }
}
