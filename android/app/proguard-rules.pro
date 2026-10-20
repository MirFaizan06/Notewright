# JavaScript bridge methods are looked up by name from the WebView.
-keepclassmembers class app.notewright.NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
