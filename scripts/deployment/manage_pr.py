import subprocess
import urllib.request
import urllib.error
import json
import sys

p = subprocess.Popen(['git', 'credential', 'fill'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
out, err = p.communicate('protocol=https\nhost=github.com\n')
token = None
for line in out.splitlines():
    if line.startswith('password='):
        token = line.split('=', 1)[1]

if not token:
    raise Exception('Token not found in credential helper')

headers = {
    'Authorization': f'Bearer {token}',
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'MIMO-Deployer'
}

pr_data = {
    'title': 'Fix MIMO 2.0 duplex print timeout',
    'head': 'mimo-2.0-ui',
    'base': 'main',
    'body': """Fixes false timeout failures on multi-sheet Brother duplex jobs.
Uses separate physical-sheet cadence for duplex printing.
Adds sufficient timeout headroom for mechanical variance.
Preserves the CUPS-completion + physical-duration dual gate.
Does not allow CUPS State 9 alone to mark a job complete.
sheetsCompleted == totalSheets remains gated by final completion.
Deployed and verified on SV-002 before merge."""
}

pr_number = None
req = urllib.request.Request(
    'https://api.github.com/repos/snowjug/mimo-test-dep2/pulls',
    data=json.dumps(pr_data).encode('utf-8'),
    headers=headers,
    method='POST'
)

try:
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        pr_number = res['number']
        html_url = res['html_url']
        print(f"[OK] PR #{pr_number} created: {html_url}")
except urllib.error.HTTPError as e:
    err_body = e.read().decode('utf-8')
    print(f"Create PR response ({e.code}): {err_body}")
    # Check open PRs
    req_open = urllib.request.Request(
        'https://api.github.com/repos/snowjug/mimo-test-dep2/pulls?head=snowjug:mimo-2.0-ui&state=open',
        headers=headers
    )
    with urllib.request.urlopen(req_open) as resp_open:
        res_open = json.loads(resp_open.read().decode('utf-8'))
        if res_open:
            pr_number = res_open[0]['number']
            html_url = res_open[0]['html_url']
            print(f"[OK] Found open PR #{pr_number}: {html_url}")

if not pr_number:
    raise Exception("Could not find or create PR")

# Step 5: BEFORE MERGING - Verify PR files
req_files = urllib.request.Request(
    f'https://api.github.com/repos/snowjug/mimo-test-dep2/pulls/{pr_number}/files',
    headers=headers
)
with urllib.request.urlopen(req_files) as resp_files:
    files_data = json.loads(resp_files.read().decode('utf-8'))
    file_names = [f['filename'] for f in files_data]
    print(f"\nFiles changed in PR #{pr_number}: {file_names}")
    
    if file_names != ['pi-listener/firebase_listener.py']:
        raise Exception(f"PR contains unexpected files: {file_names}. Expected only ['pi-listener/firebase_listener.py']")
    print("[OK] Verified: PR contains ONLY 'pi-listener/firebase_listener.py'")

# Merge PR
merge_data = {
    'commit_title': 'Fix MIMO 2.0 duplex print timeout',
    'merge_method': 'merge'
}
req_merge = urllib.request.Request(
    f'https://api.github.com/repos/snowjug/mimo-test-dep2/pulls/{pr_number}/merge',
    data=json.dumps(merge_data).encode('utf-8'),
    headers=headers,
    method='PUT'
)
with urllib.request.urlopen(req_merge) as resp_merge:
    merge_res = json.loads(resp_merge.read().decode('utf-8'))
    print(f"[OK] PR #{pr_number} merged successfully!")
    print(f"Merge SHA: {merge_res.get('sha')}")
    print(f"Merge Message: {merge_res.get('message')}")
