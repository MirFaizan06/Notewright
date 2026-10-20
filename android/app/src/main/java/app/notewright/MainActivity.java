package app.notewright;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Hosts the web app in a WebView. The page is served from the APK's assets
 * under a private https origin, so modules, workers and Web Audio behave
 * exactly as they do in a desktop browser.
 */
public class MainActivity extends Activity {
    static final String HOST = "appassets.notewright.app";
    static final String START_URL = "https://" + HOST + "/web/index.html";
    private static final int REQ_PICK = 1;
    private static final int REQ_SAVE = 2;
    private static final int BG = 0xFF14110E;

    private WebView web;
    private ValueCallback<Uri[]> pickCallback;
    private byte[] pendingSave;
    private AdProvider ads;
    private FrameLayout bannerBox;

    private static final Map<String, String> MIME = new HashMap<>();
    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("svg", "image/svg+xml");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("png", "image/png");
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        getWindow().getDecorView().setBackgroundColor(BG);
        if (Build.VERSION.SDK_INT >= 23) {
            View d = getWindow().getDecorView();
            d.setSystemUiVisibility(d.getSystemUiVisibility() & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        ads = AdsFactory.create(this);
        web = new WebView(this);
        web.setBackgroundColor(BG);
        // the web app on top, a banner strip underneath (empty and collapsed unless an ad SDK is built in)
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        bannerBox = new FrameLayout(this);
        bannerBox.setVisibility(View.GONE);
        root.addView(bannerBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.addJavascriptInterface(new NativeBridge(this), "NotewrightNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.equals("/")) path = "/web/index.html";
                try {
                    InputStream in = getAssets().open(path.substring(1));
                    String ext = path.substring(path.lastIndexOf('.') + 1);
                    String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
                    return new WebResourceResponse(mime, "utf-8", in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (HOST.equals(r.getUrl().getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (ActivityNotFoundException ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (pickCallback != null) pickCallback.onReceiveValue(null);
                pickCallback = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "video/mp4", "application/ogg"});
                try {
                    startActivityForResult(Intent.createChooser(i, "Choose a recording"), REQ_PICK);
                } catch (ActivityNotFoundException e) {
                    pickCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (state != null) web.restoreState(state); else web.loadUrl(START_URL);
        ads.start(this, bannerBox);
    }

    /** Called by the bridge: write a file through the system "save as" dialog. */
    void saveFile(String name, String mime, String base64) {
        pendingSave = Base64.decode(base64, Base64.DEFAULT);
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        startActivityForResult(i, REQ_SAVE);
    }

    private void emitAdEvent(String name) {
        runOnUiThread(() -> web.evaluateJavascript("window.__nwAdEvent && window.__nwAdEvent('" + name + "')", null));
    }

    void preloadReward() { ads.preloadReward(this, this::emitAdEvent); }

    void showReward() { ads.showReward(this, this::emitAdEvent); }

    void setBannerVisible(boolean visible) { ads.setBannerVisible(visible); }

    boolean privacyOptionsRequired() { return ads.privacyOptionsRequired(); }

    void showPrivacyOptions() { ads.showPrivacyOptions(this); }

    boolean hasNativeAds() { return ads.available(); }

    void keepScreenOn(boolean on) {
        if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_PICK && pickCallback != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null && data.getData() != null) out = new Uri[]{data.getData()};
            pickCallback.onReceiveValue(out);
            pickCallback = null;
        } else if (req == REQ_SAVE) {
            if (res == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream o = getContentResolver().openOutputStream(data.getData())) {
                    o.write(pendingSave);
                    Toast.makeText(this, "MIDI saved", Toast.LENGTH_SHORT).show();
                } catch (IOException | NullPointerException e) {
                    Toast.makeText(this, "Could not save the file", Toast.LENGTH_LONG).show();
                }
            }
            pendingSave = null;
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.__nwBack ? window.__nwBack() : false", value -> {
            if ("true".equals(value)) return;
            if (web.canGoBack()) web.goBack(); else finish();   // e.g. back from the privacy page
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.removeJavascriptInterface("NotewrightNative"); web.destroy(); }
        super.onDestroy();
    }
}
