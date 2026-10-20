package app.notewright;

import android.app.Activity;
import android.view.ViewGroup;

/** Default build: no ad SDK. The web layer falls back to its built-in placeholder slots. */
final class AdsFactory {
    private AdsFactory() { }

    static AdProvider create(Activity activity) {
        return new AdProvider() {
            @Override public boolean available() { return false; }
            @Override public void start(Activity a, ViewGroup bannerContainer) { }
            @Override public void preloadReward(Activity a, Listener l) { l.onEvent("failed"); }
            @Override public void showReward(Activity a, Listener l) { l.onEvent("failed"); }
            @Override public void setBannerVisible(boolean visible) { }
            @Override public boolean privacyOptionsRequired() { return false; }
            @Override public void showPrivacyOptions(Activity a) { }
        };
    }
}
