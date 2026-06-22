package com.example.revautsav

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var connectivityManager: ConnectivityManager
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var isLoadedSuccessfully = false
    private val kioskUrl = "https://kisokmechine.vercel.app/"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Keep the tablet screen turned on constantly for the kiosk
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Force the window to extend its drawing surface into the system bar areas
        // This is the key flag that makes content render BEHIND navigation and status bars
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )

        // Set window background to the same blue as the kiosk website so that any
        // remaining system bar area is indistinguishable from the web content
        window.setBackgroundDrawable(
            android.graphics.drawable.ColorDrawable(android.graphics.Color.parseColor("#1A56DB"))
        )

        // Make both bars fully transparent — the blue window background shows through them
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        window.statusBarColor = android.graphics.Color.TRANSPARENT

        webView = WebView(this)
        setContentView(webView)

        // Setup connectivity manager to auto-reload once internet becomes available
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        registerNetworkCallback()

        configureWebView()

        // Apply immersive fullscreen settings
        hideSystemUI()

        // Setup and start Kiosk (Lock Task) Mode if app is set as Device Owner
        // Skip locking if the startup action is explicitly "unlock"
        val action = intent?.getStringExtra("action")
        if (action != "unlock") {
            setupKioskMode()
        }

        // Process any extra actions passed in the starting intent
        handleIntent(intent)
    }

    private fun configureWebView() {
        webView.setBackgroundColor(android.graphics.Color.TRANSPARENT)
        val webSettings: WebSettings = webView.settings
        
        // Basic web settings
        webSettings.javaScriptEnabled = true
        webSettings.domStorageEnabled = true
        webSettings.databaseEnabled = true
        webSettings.loadWithOverviewMode = true
        webSettings.useWideViewPort = true
        
        // Enable local/file access (some SPAs require this)
        webSettings.allowFileAccess = true
        webSettings.allowContentAccess = true

        // Allow third party cookie and mixed content logic if applicable
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            webSettings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }

        // Log JavaScript Console messages to Logcat for remote troubleshooting
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                if (consoleMessage != null) {
                    val level = when (consoleMessage.messageLevel()) {
                        ConsoleMessage.MessageLevel.ERROR -> Log.ERROR
                        ConsoleMessage.MessageLevel.WARNING -> Log.WARN
                        else -> Log.DEBUG
                    }
                    Log.println(
                        level,
                        "KioskWebViewConsole",
                        "${consoleMessage.message()} -- Line ${consoleMessage.lineNumber()} of ${consoleMessage.sourceId()}"
                    )
                }
                return super.onConsoleMessage(consoleMessage)
            }
        }

        // Handle errors, SSL issues, and page load success/fail states
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Set load status to true only if the main application URL loaded successfully
                if (url == kioskUrl) {
                    isLoadedSuccessfully = true
                    Log.d("KioskWebView", "Successfully loaded $kioskUrl")
                }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                
                val failingUrl = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    request?.url?.toString()
                } else {
                    null
                }

                val description = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    error?.description?.toString()
                } else {
                    "Network error"
                }

                Log.e("KioskWebView", "Error loading page: $description for URL: $failingUrl")

                // Only show offline screen if it failed to load the main Vercel site
                if (failingUrl == kioskUrl || request?.isForMainFrame == true) {
                    isLoadedSuccessfully = false
                    showOfflinePage()
                }
            }

            override fun onReceivedSslError(
                view: WebView?,
                handler: SslErrorHandler?,
                error: SslError?
            ) {
                val sslErrorMsg = when (error?.primaryError) {
                    SslError.SSL_EXPIRED -> "SSL Certificate Expired"
                    SslError.SSL_IDMISMATCH -> "SSL Hostname Mismatch"
                    SslError.SSL_UNTRUSTED -> "SSL Authority Untrusted"
                    SslError.SSL_DATE_INVALID -> "SSL Date Invalid"
                    else -> "SSL Error"
                }
                
                Log.e("KioskWebView", "SSL Error occurred: $sslErrorMsg (${error?.toString()})")
                
                // Show critical notification of clock desync if date invalid is detected
                Toast.makeText(
                    this@MainActivity, 
                    "Security Error: $sslErrorMsg. Please check and sync your tablet's Date & Time!", 
                    Toast.LENGTH_LONG
                ).show()

                // Cancel the load to be secure, but logcat will guide manual resolution (e.g. updating date/time)
                handler?.cancel()
            }
        }

        webView.loadUrl(kioskUrl)
    }

    private fun showOfflinePage() {
        val errorHtml = """
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700&display=swap" rel="stylesheet">
                <style>
                    body {
                        background: linear-gradient(135deg, #090d16, #111827);
                        color: #f3f4f6;
                        font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        height: 100vh;
                        margin: 0;
                        padding: 24px;
                        box-sizing: border-box;
                    }
                    .card {
                        background: rgba(255, 255, 255, 0.03);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        border: 1px solid rgba(255, 255, 255, 0.08);
                        border-radius: 28px;
                        padding: 48px 32px;
                        max-width: 440px;
                        width: 100%;
                        text-align: center;
                        box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
                    }
                    .icon {
                        font-size: 56px;
                        margin-bottom: 24px;
                        filter: drop-shadow(0 0 12px rgba(99, 102, 241, 0.3));
                    }
                    h1 {
                        font-size: 24px;
                        margin: 0 0 12px 0;
                        font-weight: 700;
                        letter-spacing: -0.5px;
                    }
                    p {
                        color: #9ca3af;
                        font-size: 15px;
                        line-height: 1.6;
                        margin: 0 0 32px 0;
                    }
                    .btn {
                        background: linear-gradient(135deg, #6366f1, #4f46e5);
                        color: #ffffff;
                        border: none;
                        border-radius: 16px;
                        padding: 16px 32px;
                        font-size: 16px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 16px rgba(79, 70, 229, 0.4);
                        width: 100%;
                        outline: none;
                    }
                    .btn:active {
                        transform: scale(0.98);
                        box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">📡</div>
                    <h1>Kiosk Offline</h1>
                    <p>Unable to establish contact with the MIMO Kiosk server. We will auto-reconnect when your Wi-Fi/Internet becomes active.</p>
                    <button class="btn" onclick="window.location.href='$kioskUrl'">Retry Connection</button>
                </div>
            </body>
            </html>
        """.trimIndent()
        
        webView.loadDataWithBaseURL(kioskUrl, errorHtml, "text/html", "UTF-8", null)
    }

    private fun registerNetworkCallback() {
        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                super.onAvailable(network)
                // When internet connection returns, auto-reload the website if currently offline
                runOnUiThread {
                    if (!isLoadedSuccessfully) {
                        Log.i("KioskNetwork", "Network back! Reloading main Vercel site.")
                        Toast.makeText(this@MainActivity, "Network restored. Reconnecting...", Toast.LENGTH_SHORT).show()
                        webView.loadUrl(kioskUrl)
                    }
                }
            }
        }
        try {
            connectivityManager.registerNetworkCallback(networkRequest, networkCallback!!)
        } catch (e: Exception) {
            Log.e("MainActivity", "Failed to register network callback: ${e.message}")
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: android.content.Intent?) {
        if (intent == null) return
        
        val action = intent.getStringExtra("action")
        if (action == "unlock") {
            try {
                stopLockTask()
                Toast.makeText(this, "MIMO Kiosk Mode Unlocked!", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Unlock Error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        } else if (action == "lock") {
            setupKioskMode()
        }
    }

    private fun setupKioskMode() {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponentName = ComponentName(this, KioskDeviceAdminReceiver::class.java)

        if (dpm.isDeviceOwnerApp(packageName)) {
            try {
                // For Android 9 (API 28) and above, disable all system lock task features
                // This disables notifications, keyguard, system info, and the home button/pill
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    dpm.setLockTaskFeatures(adminComponentName, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
                }

                // Register this package as allowed to lock the task
                dpm.setLockTaskPackages(adminComponentName, arrayOf(packageName))
                // Start Lock Task mode (strict Kiosk mode)
                startLockTask()
                Toast.makeText(this, "REVAUTSAV Kiosk Mode Locked!", Toast.LENGTH_LONG).show()
            } catch (e: Exception) {
                Toast.makeText(this, "Kiosk Mode Error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        } else {
            Toast.makeText(
                this, 
                "Notice: App is not set as Device Owner. Run ADB command to lock task.", 
                Toast.LENGTH_LONG
            ).show()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            hideSystemUI()
        }
    }

    private fun hideSystemUI() {
        // Always apply legacy flags as a base layer (works on all API levels)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
        )

        // Additionally apply the modern API on Android 11+ for stronger enforcement
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            val controller = window.insetsController
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        networkCallback?.let {
            try {
                connectivityManager.unregisterNetworkCallback(it)
            } catch (e: Exception) {
                Log.e("MainActivity", "Failed to unregister network callback: ${e.message}")
            }
        }
    }
}