package app.notewright;

import android.app.Activity;
import android.view.ViewGroup;

/** Stand-in used when no ad SDK is built in, or when it failed to start. */
final class NoAdProvider implements AdProvider {
    @Override public boolean available() { return false; }
    @Override public void start(Activity a, ViewGroup bannerContainer) { }
    @Override public void preloadReward(Activity a, Listener l) { l.onEvent("failed"); }
    @Override public void showReward(Activity a, Listener l) { l.onEvent("failed"); }
    @Override public void setBannerVisible(boolean visible) { }
    @Override public boolean privacyOptionsRequired() { return false; }
    @Override public void showPrivacyOptions(Activity a) { }
}
