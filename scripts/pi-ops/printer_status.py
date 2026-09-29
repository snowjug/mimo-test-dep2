#!/usr/bin/env python3
"""Ask a USB Brother laser for its status and page counter over PJL (read-only, prints nothing).

Uses the system libusb through ctypes, so no packages are needed on the Pi. Talks to interface 0 / alt 0
(Printer class, bidirectional): bulk OUT 0x01, bulk IN 0x82. Only run while CUPS is not printing to the device.

    sudo python3 printer_status.py            # human-readable
    sudo python3 printer_status.py --json     # one JSON object (for the listener)
"""
import ctypes
import ctypes.util
import glob
import json
import re
import sys
import time

BROTHER_VID = 0x04F9
IFACE, ALT, EP_OUT, EP_IN = 0, 0, 0x01, 0x82
UEL = b"\x1b%-12345X"
QUERY = UEL + b"@PJL\r\n@PJL INFO ID\r\n@PJL INFO STATUS\r\n@PJL INFO PAGECOUNT\r\n" + UEL

lib = ctypes.CDLL(ctypes.util.find_library("usb-1.0") or "libusb-1.0.so.0")
lib.libusb_open_device_with_vid_pid.restype = ctypes.c_void_p
lib.libusb_open_device_with_vid_pid.argtypes = [ctypes.c_void_p, ctypes.c_uint16, ctypes.c_uint16]
for name in ("libusb_kernel_driver_active", "libusb_detach_kernel_driver", "libusb_attach_kernel_driver",
             "libusb_claim_interface", "libusb_release_interface"):
    getattr(lib, name).argtypes = [ctypes.c_void_p, ctypes.c_int]
lib.libusb_set_interface_alt_setting.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int]
lib.libusb_bulk_transfer.argtypes = [ctypes.c_void_p, ctypes.c_ubyte, ctypes.c_char_p, ctypes.c_int,
                                     ctypes.POINTER(ctypes.c_int), ctypes.c_uint]
lib.libusb_close.argtypes = [ctypes.c_void_p]
LIBUSB_ERROR_TIMEOUT = -7


def brother_pid():
    """Product id of the first Brother device on the bus (0503 HL-L5210DN, 0587 HL-L2440DW)."""
    for path in glob.glob("/sys/bus/usb/devices/*/idVendor"):
        try:
            if int(open(path).read(), 16) == BROTHER_VID:
                return int(open(path.replace("idVendor", "idProduct")).read(), 16)
        except OSError:
            pass
    return None


def query():
    ctx = ctypes.c_void_p()
    if lib.libusb_init(ctypes.byref(ctx)) != 0:
        raise RuntimeError("libusb_init failed")
    pid = brother_pid()
    if pid is None:
        raise RuntimeError("no Brother printer on USB")
    h = lib.libusb_open_device_with_vid_pid(ctx, BROTHER_VID, pid)
    if not h:
        raise RuntimeError("could not open printer (run with sudo?)")
    reattach = False
    try:
        if lib.libusb_kernel_driver_active(h, IFACE) == 1:
            lib.libusb_detach_kernel_driver(h, IFACE)
            reattach = True
        rc = lib.libusb_claim_interface(h, IFACE)
        if rc != 0:
            raise RuntimeError(f"printer busy (claim failed {rc})")
        lib.libusb_set_interface_alt_setting(h, IFACE, ALT)
        n = ctypes.c_int()
        lib.libusb_bulk_transfer(h, EP_OUT, QUERY, len(QUERY), ctypes.byref(n), 3000)
        buf, out, deadline = ctypes.create_string_buffer(4096), b"", time.time() + 6
        while time.time() < deadline:
            rc = lib.libusb_bulk_transfer(h, EP_IN, buf, 4096, ctypes.byref(n), 700)
            if n.value:
                out += buf.raw[: n.value]
            if b"PAGECOUNT" in out and out.rstrip().endswith(b"\x0c"):
                break
            if rc not in (0, LIBUSB_ERROR_TIMEOUT):
                break
        lib.libusb_release_interface(h, IFACE)
        return pid, out.decode("latin-1", "replace")
    finally:
        if reattach:
            lib.libusb_attach_kernel_driver(h, IFACE)
        lib.libusb_close(h)
        lib.libusb_exit(ctx)


def parse(raw):
    info = {"raw": raw.replace("\x0c", "").strip()}
    m = re.search(r"INFO ID\s*\r?\n\s*\"?([^\r\n\"]+)", raw)
    info["model"] = m.group(1).strip() if m else None
    m = re.search(r"CODE=(\d+)", raw)
    info["status_code"] = int(m.group(1)) if m else None
    m = re.search(r"DISPLAY=\"([^\"]*)\"", raw)
    info["display"] = m.group(1) if m else None
    m = re.search(r"ONLINE=(\w+)", raw)
    info["online"] = (m.group(1).upper() == "TRUE") if m else None
    m = re.search(r"INFO PAGECOUNT\s*\r?\n\s*(?:PAGECOUNT=)?(\d+)", raw)
    info["pagecount"] = int(m.group(1)) if m else None
    return info


if __name__ == "__main__":
    try:
        pid, raw = query()
        info = parse(raw)
        info["usb_pid"] = f"{pid:04x}"
    except Exception as e:  # report, never raise to the caller
        info = {"error": str(e)}
    if "--json" in sys.argv:
        print(json.dumps(info))
    else:
        for k, v in info.items():
            if k != "raw":
                print(f"{k:12} {v}")
        print("---- raw PJL reply ----")
        print(info.get("raw", ""))
