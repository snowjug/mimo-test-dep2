"""Phase 2C signing primitives: HKDF-SHA256 key derivation and HMAC-SHA256 over the canonical
request string, exactly as specified in docs/architecture/MIMO_EDGE_GUARDIAN_PHASE_2A_CONTRACT.md
sections 2-3. Pure functions: no I/O, no clock, no logging, no network.

`hkdf_sha256`/`derive_kiosk_key` exist here ONLY so this file's own tests can verify the Python
and Node derivations produce byte-identical output against the contract's golden vectors (the
same cross-language check guardianCrypto.test.js performs on the Node side). The Pi-side
publisher (guardian/publisher.py) never calls `derive_kiosk_key` and never holds a master key --
it is constructed with an already-derived per-kiosk key, provisioned out of band. See
publisher.py's module docstring.
"""
from __future__ import annotations

import hashlib
import hmac as _hmac

HKDF_INFO = b"mimo-guardian-v1"
DERIVED_KEY_LEN = 32


def hkdf_sha256(master_key: bytes, salt: bytes, info: bytes = HKDF_INFO, length: int = DERIVED_KEY_LEN) -> bytes:
    """RFC 5869 HKDF-SHA256 (extract-then-expand)."""
    prk = _hmac.new(salt, master_key, hashlib.sha256).digest()
    t = b""
    okm = b""
    counter = 1
    while len(okm) < length:
        t = _hmac.new(prk, t + info + bytes([counter]), hashlib.sha256).digest()
        okm += t
        counter += 1
    return okm[:length]


def info_for_key_version(key_version: int) -> bytes:
    """Phase 2F key versioning: version 1 is the original, unsuffixed info string byte-for-byte (so
    every existing golden vector from Phase 2A-2E, computed before versioning existed, stays valid
    with no regeneration); version >= 2 gets a distinct `info` by suffixing it, so a rotated key
    version deterministically derives a different key from the SAME master key."""
    if not isinstance(key_version, int) or isinstance(key_version, bool) or key_version < 1:
        raise ValueError(f"key_version must be a positive integer, got {key_version!r}")
    return HKDF_INFO if key_version == 1 else HKDF_INFO + f":kv{key_version}".encode("ascii")


def derive_kiosk_key(master_key_hex: str, kiosk_id: str, key_version: int = 1) -> bytes:
    """Test/verification helper only -- see the module docstring. Not used by the publisher."""
    master_key = bytes.fromhex(master_key_hex)
    salt = kiosk_id.encode("ascii")
    return hkdf_sha256(master_key, salt, info_for_key_version(key_version))


def canonical_string(*, method: str, path: str, kiosk_id: str, stream_id: str, boot_id: int, seq: int,
                      timestamp: int, body_sha256_hex: str) -> bytes:
    """The exact canonical signing string from the contract (section 2.2), ASCII bytes, \\n-joined:
    METHOD PATH KIOSK_ID STREAM_ID BOOT_ID SEQ TIMESTAMP BODY_SHA256_HEX."""
    parts = [method, path, kiosk_id, stream_id, str(boot_id), str(seq), str(timestamp), body_sha256_hex]
    return "\n".join(parts).encode("ascii")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def hmac_sha256_hex(key: bytes, data: bytes) -> str:
    return _hmac.new(key, data, hashlib.sha256).hexdigest()


def hex_equal_constant_time(a: str, b: str) -> bool:
    """Constant-time comparison of two (hex) strings, same shape as the Node side's
    hexEqualConstantTime / kiosk.routes.js's secretsMatch: both are hashed to a fixed 32-byte
    digest first so a length mismatch can never throw or short-circuit early. Not used by the
    publisher itself (it only signs, never verifies), kept here for symmetry and future reuse."""
    ha = hashlib.sha256((a or "").encode("utf-8")).digest()
    hb = hashlib.sha256((b or "").encode("utf-8")).digest()
    return _hmac.compare_digest(ha, hb)
