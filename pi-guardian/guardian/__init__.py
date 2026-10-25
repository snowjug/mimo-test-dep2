"""MIMO Edge Guardian, Phase 1: local, read-only observation and diagnosis core.

Observe -> classify -> snapshot. Nothing in this package publishes, repairs or controls anything, and nothing
here imports or talks to Firebase, the MIMO backend, the print listener or CUPS configuration.
"""

__version__ = "0.1.0-phase1"
SCHEMA_VERSION = 1
