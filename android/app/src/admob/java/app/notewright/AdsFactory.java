package app.notewright;

import android.app.Activity;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentDebugSettings;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import java.util.ArrayList;
import java.util.List;

/**
 * AdMob: consent form, rewarded ad per conversion, adaptive banner.
 * Only compiled with -Pads=admob. Unit ids come from android/ads.properties
 * (or -PadmobRewardedUnit=... -PadmobBannerUnit=...); Google's public test ids
 * are used until you set your own. See docs/ADS.md.
 */
final class AdsFactory {
    private AdsFactory() { }

    /** Hashed device ids from ads.properties (admobTestDevices). Empty in normal builds. */
    private static List<String> testDevices() {
        List<String> out = new ArrayList<>();
        for (String s : BuildConfig.ADMOB_TEST_DEVICES.split(",")) if (!s.trim().isEmpty()) out.add(s.trim());
        return out;
    }

    static AdProvider create(Activity activity) {
        return new AdProvider() {
            private RewardedAd rewarded;
            private boolean loading;
            private boolean initialised;
            private ViewGroup bannerBox;
            private AdView banner;
            private boolean bannerWanted = true;

            @Override public boolean available() { return true; }

            @Override
            public void start(Activity a, ViewGroup container) {
                bannerBox = container;
                ConsentInformation info = UserMessagingPlatform.getConsentInformation(a);
                ConsentRequestParameters.Builder pb = new ConsentRequestParameters.Builder();
                List<String> devices = testDevices();
                if (BuildConfig.ADMOB_CONSENT_DEBUG && !devices.isEmpty()) {
                    // pretend to be in the EEA so the consent form can be previewed
                    ConsentDebugSettings.Builder d = new ConsentDebugSettings.Builder(a)
                            .setDebugGeography(ConsentDebugSettings.DebugGeography.DEBUG_GEOGRAPHY_EEA);
                    for (String id : devices) d.addTestDeviceHashedId(id);
                    pb.setConsentDebugSettings(d.build());
                }
                ConsentRequestParameters params = pb.build();
                info.requestConsentInfoUpdate(a, params,
                        () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(a, formError -> initIfAllowed(a, info)),
                        error -> initIfAllowed(a, info));
                // consent from an earlier session may already allow ads
                initIfAllowed(a, info);
            }

            private void initIfAllowed(Activity a, ConsentInformation info) {
                if (initialised || !info.canRequestAds()) return;
                initialised = true;
                List<String> devices = testDevices();
                if (!devices.isEmpty()) MobileAds.setRequestConfiguration(new RequestConfiguration.Builder().setTestDeviceIds(devices).build());
                MobileAds.initialize(a, status -> { });
                loadBanner(a);
            }

            private void loadBanner(Activity a) {
                if (bannerBox == null || banner != null) return;
                DisplayMetrics m = a.getResources().getDisplayMetrics();
                int widthDp = (int) (m.widthPixels / m.density);
                banner = new AdView(a);
                banner.setAdUnitId(BuildConfig.ADMOB_BANNER_UNIT);
                banner.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(a, widthDp));
                bannerBox.removeAllViews();
                bannerBox.addView(banner);
                bannerBox.setVisibility(bannerWanted ? View.VISIBLE : View.GONE);
                banner.loadAd(new AdRequest.Builder().build());
            }

            @Override
            public void setBannerVisible(boolean visible) {
                bannerWanted = visible;
                if (bannerBox != null && banner != null) bannerBox.setVisibility(visible ? View.VISIBLE : View.GONE);
            }

            @Override
            public void preloadReward(Activity a, Listener l) {
                if (rewarded != null) { l.onEvent("ready"); return; }
                if (loading) return;
                if (!initialised) { l.onEvent("failed"); return; }   // no consent, or SDK not ready
                loading = true;
                RewardedAd.load(a, BuildConfig.ADMOB_REWARDED_UNIT, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
                    @Override public void onAdLoaded(RewardedAd ad) { rewarded = ad; loading = false; l.onEvent("ready"); }
                    @Override public void onAdFailedToLoad(LoadAdError e) { rewarded = null; loading = false; l.onEvent("failed"); }
                });
            }

            @Override
            public void showReward(Activity a, Listener l) {
                RewardedAd ad = rewarded;
                if (ad == null) { l.onEvent("failed"); return; }
                rewarded = null;
                ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override public void onAdDismissedFullScreenContent() { l.onEvent("closed"); }
                    @Override public void onAdFailedToShowFullScreenContent(AdError e) { l.onEvent("failed"); }
                });
                ad.show(a, reward -> l.onEvent("earned"));
            }

            @Override
            public boolean privacyOptionsRequired() {
                return UserMessagingPlatform.getConsentInformation(activity).getPrivacyOptionsRequirementStatus()
                        == ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED;
            }

            @Override
            public void showPrivacyOptions(Activity a) {
                UserMessagingPlatform.showPrivacyOptionsForm(a, formError -> { });
            }
        };
    }
}
