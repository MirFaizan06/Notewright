package app.notewright;

import android.app.Activity;

/** Default build: no ad SDK. The web layer shows no ads either (see scripts/build-web.mjs). */
final class AdsFactory {
    private AdsFactory() { }

    static AdProvider create(Activity activity) {
        return new NoAdProvider();
    }
}
