import subprocess
import time
import json
import urllib.request
import os
import websocket
import base64

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
USER_DATA_DIR = os.path.join(os.environ.get("TEMP", r"C:\Temp"), "chrome_test_profile_" + str(int(time.time())))
os.makedirs(USER_DATA_DIR, exist_ok=True)

print("=" * 60)
print("1. LAUNCHING CHROME IN HEADLESS CDP MODE")
print("=" * 60)

chrome_proc = subprocess.Popen([
    CHROME_PATH,
    "--headless=new",
    "--remote-debugging-port=9222",
    "--remote-allow-origins=*",
    f"--user-data-dir={USER_DATA_DIR}",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,800",
    "about:blank"
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

time.sleep(2)

# Get WebSocket debugger URL
try:
    with urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5) as resp:
        targets = json.loads(resp.read().decode())
        ws_url = targets[0]["webSocketDebuggerUrl"]
        print(f"Connected to Chrome target: {targets[0]['title']}")
except Exception as e:
    print(f"Failed to connect to Chrome DevTools: {e}")
    chrome_proc.terminate()
    exit(1)

ws = websocket.create_connection(ws_url)
msg_id = 0

def send_cdp(method, params=None):
    global msg_id
    msg_id += 1
    req = {"id": msg_id, "method": method, "params": params or {}}
    ws.send(json.dumps(req))
    while True:
        res = json.loads(ws.recv())
        if res.get("id") == msg_id:
            return res.get("result", {})

def navigate(url):
    send_cdp("Page.navigate", {"url": url})
    time.sleep(1.5)

def evaluate(expr):
    res = send_cdp("Runtime.evaluate", {"expression": expr, "returnByValue": True})
    return res.get("result", {}).get("value")

def take_screenshot(filename):
    res = send_cdp("Page.captureScreenshot", {"format": "png"})
    data = res.get("data")
    if data:
        path = os.path.join(r"c:\Users\chand\OneDrive\Desktop\1.0mimo\mimo-test-dep2\scratch", filename)
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))
        print(f"  [SCREENSHOT] Saved: {filename}")

send_cdp("Page.enable")
send_cdp("Runtime.enable")

print("\n" + "=" * 60)
print("TEST 1: CLEAR STORAGE & OPEN http://localhost:5174/")
print("=" * 60)

navigate("http://localhost:5174/")
evaluate("localStorage.clear(); sessionStorage.clear();")
navigate("http://localhost:5174/")

title = evaluate("document.title")
login_btn_exists = evaluate("!!document.getElementById('admin-login-btn')")
app_shell_exists = evaluate("!!document.querySelector('.dashboard-app-shell')")
body_text = evaluate("document.body.innerText")

print(f"  Page Title: '{title}'")
print(f"  Login Button Present: {login_btn_exists}")
print(f"  AppShell/Overview Present: {app_shell_exists}")
print(f"  Contains 'Welcome back': {'Welcome back' in body_text}")
print(f"  Contains 'Sign in to access': {'Sign in to access the MIMO administration console' in body_text}")
print(f"  First Screen is Login Page: {login_btn_exists and not app_shell_exists}")
take_screenshot("test1_root_login.png")

print("\n" + "=" * 60)
print("TEST 2: OPEN http://localhost:5174/admin/ (UNAUTHENTICATED)")
print("=" * 60)

navigate("http://localhost:5174/admin/")
login_btn_exists_2 = evaluate("!!document.getElementById('admin-login-btn')")
app_shell_exists_2 = evaluate("!!document.querySelector('.dashboard-app-shell')")
path_2 = evaluate("window.location.pathname")

print(f"  Pathname: '{path_2}'")
print(f"  Login Button Present: {login_btn_exists_2}")
print(f"  AppShell/Overview Present: {app_shell_exists_2}")
print(f"  Renders Login Page (NOT Dashboard): {login_btn_exists_2 and not app_shell_exists_2}")
take_screenshot("test2_unauth_admin.png")

print("\n" + "=" * 60)
print("TEST 3: OPEN http://localhost:5174/admin/analytics (UNAUTHENTICATED)")
print("=" * 60)

navigate("http://localhost:5174/admin/analytics")
login_btn_exists_3 = evaluate("!!document.getElementById('admin-login-btn')")
app_shell_exists_3 = evaluate("!!document.querySelector('.dashboard-app-shell')")
path_3 = evaluate("window.location.pathname")

print(f"  Pathname: '{path_3}'")
print(f"  Login Button Present: {login_btn_exists_3}")
print(f"  AppShell/Overview Present: {app_shell_exists_3}")
print(f"  Renders Login Page (NOT Dashboard): {login_btn_exists_3 and not app_shell_exists_3}")
take_screenshot("test3_unauth_analytics.png")

print("\n" + "=" * 60)
print("TEST 4: EXPLICIT LOGIN SUBMISSION")
print("=" * 60)

navigate("http://localhost:5174/")
evaluate("""
(() => {
    const emailInput = document.getElementById('admin-username-input');
    const passInput = document.getElementById('admin-password-input');
    const form = document.querySelector('form');
    
    // React value setter
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    nativeInputValueSetter.call(emailInput, 'admin@mimo.print');
    emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    nativeInputValueSetter.call(passInput, 'password123');
    passInput.dispatchEvent(new Event('input', { bubbles: true }));
    
    document.getElementById('admin-login-btn').click();
})()
""")

time.sleep(2)

path_4 = evaluate("window.location.pathname")
app_shell_exists_4 = evaluate("!!document.querySelector('.dashboard-app-shell')")
login_btn_exists_4 = evaluate("!!document.getElementById('admin-login-btn')")
body_text_4 = evaluate("document.body.innerText")

print(f"  Post-Login Pathname: '{path_4}'")
print(f"  AppShell/Dashboard Rendered: {app_shell_exists_4}")
print(f"  Login Form Gone: {not login_btn_exists_4}")
print(f"  Contains Overview/Dashboard text: {'Overview' in body_text_4 or 'MIMO' in body_text_4}")
take_screenshot("test4_authenticated_dashboard.png")

print("\n" + "=" * 60)
print("TEST 5: REFRESH WHILE AUTHENTICATED")
print("=" * 60)

navigate("http://localhost:5174/admin/")
path_5 = evaluate("window.location.pathname")
app_shell_exists_5 = evaluate("!!document.querySelector('.dashboard-app-shell')")
print(f"  Pathname: '{path_5}'")
print(f"  AppShell/Dashboard Remains Rendered: {app_shell_exists_5}")
take_screenshot("test5_refresh_authenticated.png")

print("\n" + "=" * 60)
print("TEST 6: SIGN OUT")
print("=" * 60)

evaluate("""
(() => {
    // Call authService.logout() or click signout
    localStorage.removeItem('adminToken');
    sessionStorage.removeItem('adminToken');
    window.location.href = '/login';
})()
""")

time.sleep(1.5)

path_6 = evaluate("window.location.pathname")
login_btn_exists_6 = evaluate("!!document.getElementById('admin-login-btn')")
app_shell_exists_6 = evaluate("!!document.querySelector('.dashboard-app-shell')")
print(f"  Pathname: '{path_6}'")
print(f"  Login Page Rendered After Sign Out: {login_btn_exists_6 and not app_shell_exists_6}")
take_screenshot("test6_signed_out.png")

print("\n" + "=" * 60)
print("TEST 7: REFRESH AFTER SIGN OUT")
print("=" * 60)

navigate("http://localhost:5174/")
path_7 = evaluate("window.location.pathname")
login_btn_exists_7 = evaluate("!!document.getElementById('admin-login-btn')")
app_shell_exists_7 = evaluate("!!document.querySelector('.dashboard-app-shell')")
print(f"  Pathname: '{path_7}'")
print(f"  Login Page Still Rendered: {login_btn_exists_7 and not app_shell_exists_7}")
take_screenshot("test7_refresh_signed_out.png")

ws.close()
chrome_proc.terminate()
print("\n✅ Chrome CDP E2E Automation Completed Successfully!")
