package app.notewright;

import android.webkit.JavascriptInterface;

/** The small surface the web app can call: window.NotewrightNative.* */
public class NativeBridge {
    private final MainActivity activity;

    NativeBridge(MainActivity activity) { this.activity = activity; }

    @JavascriptInterface
    public void saveFile(String name, String mime, String base64) {
        activity.runOnUiThread(() -> activity.saveFile(name, mime, base64));
    }

    @JavascriptInterface
    public boolean hasNativeAds() { return activity.hasNativeAds(); }

    @JavascriptInterface
    public void preloadReward() { activity.runOnUiThread(activity::preloadReward); }

    @JavascriptInterface
    public void showReward() { activity.runOnUiThread(activity::showReward); }

    @JavascriptInterface
    public void setBannerVisible(boolean visible) { activity.runOnUiThread(() -> activity.setBannerVisible(visible)); }

    @JavascriptInterface
    public boolean privacyOptionsRequired() { return activity.privacyOptionsRequired(); }

    @JavascriptInterface
    public void showPrivacyOptions() { activity.runOnUiThread(activity::showPrivacyOptions); }

    @JavascriptInterface
    public void keepScreenOn(boolean on) {
        activity.runOnUiThread(() -> activity.keepScreenOn(on));
    }

    @JavascriptInterface
    public String platform() { return "android"; }
}
