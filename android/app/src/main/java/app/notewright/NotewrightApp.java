package app.notewright;

import android.app.Application;

public class NotewrightApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        CrashReporter.install(this);
    }
}
