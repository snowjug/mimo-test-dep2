# Mimo Print System — Troubleshooting & Bug Fix Log

**Date of Resolution:** 27 May 2026

This document details the issues faced and the solutions implemented to stabilize the End-to-End printing flow between the Mimo Web Frontend, Northflank Backend, and Raspberry Pi Print Server.

## Issue 1: React Frontend Crash on Payment Screen
**Problem:** After confirming the payment, the frontend would crash and display a blank white screen instead of handling the error gracefully. 
**Root Cause:** The frontend code was passing the entire raw error JSON object directly into the `toast.error()` function, which expects a string. This crashed the React renderer.
**Solution:** Updated `payment.tsx` to safely extract the error string from `err.response.data` before passing it to `toast.error()`. (Commit `bd41203`)

## Issue 2: Infinite Retry Loop for Corrupted PDFs
**Problem:** If a user uploaded a corrupted or unparsable PDF, the backend's background worker would crash while trying to count the pages. It would then reset the job status back to `pending_conversion`. The worker would immediately pick it up again, causing an infinite crashing loop.
**Root Cause:** The `catch` block in the background processing queue was simply throwing the error instead of updating the Firestore document status.
**Solution:** Modified `server.js` (background processor) to catch the error, log it, and explicitly update the Firestore document status to `failed`. This safely removes the corrupted job from the queue forever. (Commit `fa8d323`)

## Issue 3: TLS Socket Handshake Failure Between Northflank and Pi
**Problem:** The Node.js backend on Northflank was completely failing to connect to the Raspberry Pi over the Tailscale VPN. It threw `socket hang up` and TLS handshake errors on every request to `https://printpi.tail2146fa.ts.net`.
**Root Cause:** Northflank's internal Kubernetes network uses the `100.x.x.x` subnet, which directly conflicts with Tailscale's `100.x.x.x` subnet. Because the Pi's Tailscale IPv4 address was unroutable, Node.js attempted to use IPv6, which Northflank pods do not support for outbound connections without special configuration. The `axios` library failed to fallback gracefully.
**Solution:**
1. Replaced `axios` with native `fetch()` in Node.js for the Pi calls.
2. Abandoned Tailscale entirely for the Northflank-to-Pi connection.
3. Switched to public HTTP/HTTPS tunnels (first Pinggy, then localtunnel, and finally ngrok). (Commits `f00225c` to `b48ce6a`)

## Issue 4: "Invalid or already used print code" on Kiosk
**Problem:** During the automated smoke test, submitting the 4-digit code to the kiosk iPad returned "Invalid or already used print code", even though the payment was successful.
**Root Cause:** The `/kiosk/print` endpoint only searches for jobs with `status: "paid"`. However, the test script was omitting the `pageCount` parameter during the `/finalize-upload` step. The backend created the job with `status: "pending_conversion"`. The background worker then failed on the tiny test file and set it to `failed`. It never reached `paid` status.
**Solution:** Updated the smoke test script to explicitly pass `pageCount: 1`. This allows the backend to create the job as `status: "pending"` immediately, allowing the payment step to successfully move it to `paid`. (Commit `807049d`)

## Issue 5: Tunnel URLs Expiring Constantly
**Problem:** We used Pinggy, which expired every 60 minutes, changing the Pi's URL and breaking the Northflank connection. We then tried Localtunnel with a custom subdomain, but the subdomain feature was unreliable and often ignored our request, generating random URLs anyway.
**Root Cause:** Free tunnel services rotate URLs by design unless you have a registered account and a claimed static domain.
**Solution:** 
1. The user registered for a free `ngrok` account and claimed a permanent static domain (`splashed-giddily-populace.ngrok-free.dev`).
2. Configured a permanent `ngrok-print.service` systemd unit on the Pi to auto-start on boot using this static domain.
3. Hardcoded the static domain into the Northflank Node.js backend as the primary Pi tunnel URL, with an environment variable (`PI_BASE_URL`) override. The URL never changes, even after Pi reboots or power outages. (Commit `b48ce6a`)
