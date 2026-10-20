package app.notewright;

import android.app.Activity;
import android.view.ViewGroup;

/** What the app needs from an ad network: consent, one rewarded ad per conversion, and a banner. */
public interface AdProvider {
    /** Receives short event names for the web layer: ready, failed, earned, closed. */
    interface Listener { void onEvent(String name); }

    /** True when a real ad network is compiled in. */
    boolean available();

    /** Runs the consent flow, then initialises the SDK and loads the banner into the container. */
    void start(Activity activity, ViewGroup bannerContainer);

    /** Loads a rewarded ad so it is ready by the time the user taps. Reports ready or failed. */
    void preloadReward(Activity activity, Listener listener);

    /** Shows the loaded rewarded ad. Reports earned (once), then closed; or failed. */
    void showReward(Activity activity, Listener listener);

    void setBannerVisible(boolean visible);

    /** Whether the user must be able to reopen the consent choices (EEA/UK). */
    boolean privacyOptionsRequired();

    void showPrivacyOptions(Activity activity);
}
