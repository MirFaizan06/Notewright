package app.notewright;

import android.app.Activity;
import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import android.window.OnBackInvokedDispatcher;

import java.io.ByteArrayInputStream;
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
    private LinearLayout root;
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
        MIME.put("txt", "text/plain");
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

        // An ad SDK problem must never take the app down: fall back to no ads.
        try { ads = AdsFactory.create(this); } catch (Throwable t) { CrashReporter.record(this, "ads: " + t); ads = new NoAdProvider(); }

        // the web app on top, a banner strip underneath (empty and collapsed unless an ad SDK is built in)
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        bannerBox = new FrameLayout(this);
        bannerBox.setVisibility(View.GONE);
        web = buildWebView();
        root.addView(web, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(bannerBox, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        setContentView(root);
        applySystemBarInsets(root);

        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13+ delivers Back through this callback (Android 16 no longer calls onBackPressed)
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }

        if (state != null) web.restoreState(state); else web.loadUrl(START_URL);
        try { ads.start(this, bannerBox); } catch (Throwable t) { CrashReporter.record(this, "ads start: " + t); ads = new NoAdProvider(); }
        showPreviousCrash();
    }

    private WebView buildWebView() {
        WebView w = new WebView(this);
        w.setBackgroundColor(BG);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        w.addJavascriptInterface(new NativeBridge(this), "NotewrightNative");

        w.setWebViewClient(new WebViewClient() {
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
                    // unknown path (a favicon request, for instance): answer with an empty 404, never a null stream
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (HOST.equals(r.getUrl().getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (ActivityNotFoundException ignored) { }
                return true;
            }

            /** If the browser engine's process dies (usually low memory) the app would be killed too; recover instead. */
            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail detail) {
                CrashReporter.record(MainActivity.this, "WebView renderer " + (detail.didCrash() ? "crashed" : "was killed by the system (probably low memory)"));
                runOnUiThread(() -> {
                    Toast.makeText(MainActivity.this, "Notewright ran out of memory and restarted. Try a shorter recording.", Toast.LENGTH_LONG).show();
                    if (root != null && web != null) {
                        root.removeView(web);
                        web.destroy();
                        web = buildWebView();
                        root.addView(web, 0, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
                        web.loadUrl(START_URL);
                    }
                });
                return true;
            }
        });

        w.setWebChromeClient(new WebChromeClient() {
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
        return w;
    }

    /** From Android 15 apps draw behind the system bars; keep content and the banner clear of them. */
    private void applySystemBarInsets(View v) {
        v.setOnApplyWindowInsetsListener((view, insets) -> {
            int l, t, r, b;
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                l = i.left; t = i.top; r = i.right; b = i.bottom;
            } else {
                l = insets.getSystemWindowInsetLeft(); t = insets.getSystemWindowInsetTop();
                r = insets.getSystemWindowInsetRight(); b = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(l, t, r, b);
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        v.requestApplyInsets();
    }

    /** Shows the error from the previous run, if there was one, so it can be reported. */
    private void showPreviousCrash() {
        final String report = CrashReporter.takePending(this);
        if (report == null) return;
        TextView tv = new TextView(this);
        tv.setText(report);
        tv.setTextSize(11);
        tv.setTextIsSelectable(true);
        tv.setPadding(40, 20, 40, 20);
        android.widget.ScrollView sv = new android.widget.ScrollView(this);
        sv.addView(tv);
        new AlertDialog.Builder(this)
                .setTitle("Notewright stopped last time")
                .setMessage("Please copy this and paste it into a new issue at github.com/MirFaizan06/Notewright/issues so it can be fixed.")
                .setView(sv)
                .setPositiveButton("Copy", (d, w) -> {
                    ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                    if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("Notewright crash report", report));
                })
                .setNegativeButton("Close", null)
                .show();
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
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript("window.__nwAdEvent && window.__nwAdEvent('" + name + "')", null); });
    }

    void preloadReward() { try { ads.preloadReward(this, this::emitAdEvent); } catch (Throwable t) { CrashReporter.record(this, "ads preload: " + t); emitAdEvent("failed"); } }

    void showReward() { try { ads.showReward(this, this::emitAdEvent); } catch (Throwable t) { CrashReporter.record(this, "ads show: " + t); emitAdEvent("failed"); } }

    void setBannerVisible(boolean visible) { try { ads.setBannerVisible(visible); } catch (Throwable ignored) { } }

    boolean privacyOptionsRequired() { try { return ads.privacyOptionsRequired(); } catch (Throwable t) { return false; } }

    void showPrivacyOptions() { try { ads.showPrivacyOptions(this); } catch (Throwable ignored) { } }

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

    /** Back: let the web app handle it first (close a dialog, leave a result), then go back a page, then exit. */
    private void handleBack() {
        if (web == null) { finish(); return; }
        web.evaluateJavascript("window.__nwBack ? window.__nwBack() : false", value -> {
            if ("true".equals(value)) return;
            if (web != null && web.canGoBack()) web.goBack(); else finish();
        });
    }

    /** Used on Android 12 and older; newer versions deliver Back to the callback registered in onCreate. */
    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        // only the navigation history, kept small: the page rebuilds its own state
        try { if (web != null) web.saveState(out); } catch (Throwable ignored) { }
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.removeJavascriptInterface("NotewrightNative"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
