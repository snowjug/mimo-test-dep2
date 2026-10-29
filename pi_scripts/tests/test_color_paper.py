import unittest
from unittest.mock import MagicMock, patch
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from test_listener_inputs import _load_listener

L = _load_listener()
if not hasattr(L.firestore, "Increment"):
    L.firestore.Increment = lambda x: f"Increment({x})"
if not hasattr(L.firestore, "transactional"):
    L.firestore.transactional = lambda fn: fn


class TestColorPaperDeduction(unittest.TestCase):
    def test_deduct_color_paper_usage_none_db(self):
        with patch.object(L, "db", None):
            # Should safely return without exception
            L.deduct_color_paper_usage(5)

    def test_deduct_color_paper_usage_zero_sheets(self):
        mock_db = MagicMock()
        with patch.object(L, "db", mock_db):
            L.deduct_color_paper_usage(0)
            mock_db.collection.assert_not_called()

    def test_deduct_color_paper_usage_success(self):
        mock_db = MagicMock()
        mock_hw_ref = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_hw_ref

        # Mock snapshot
        mock_snap = MagicMock()
        mock_snap.exists = True
        mock_snap.to_dict.return_value = {
            "SV-002-COLOR": {
                "paperLevel": 90,
                "paperCapacity": 100,
            }
        }
        mock_hw_ref.get.return_value = mock_snap

        mock_txn = MagicMock()
        mock_db.transaction.return_value = mock_txn

        with patch.object(L, "db", mock_db):
            with patch.object(L.firestore, "SERVER_TIMESTAMP", "SERVER_TIMESTAMP"):
                L.deduct_color_paper_usage(3)

        mock_txn.update.assert_called_once()
        args, kwargs = mock_txn.update.call_args
        self.assertEqual(args[0], mock_hw_ref)
        update_dict = args[1]
        self.assertEqual(update_dict["SV-002-COLOR.paperLevel"], 87)
        self.assertEqual(update_dict["SV-002-COLOR.lastPaperDeduction"], "SERVER_TIMESTAMP")
        self.assertEqual(update_dict["SV-002-COLOR.pageCount"], "Increment(3)")

    def test_deduct_color_paper_clamped_to_zero(self):
        mock_db = MagicMock()
        mock_hw_ref = MagicMock()
        mock_db.collection.return_value.document.return_value = mock_hw_ref

        mock_snap = MagicMock()
        mock_snap.exists = True
        mock_snap.to_dict.return_value = {
            "SV-002-COLOR": {
                "paperLevel": 2,
            }
        }
        mock_hw_ref.get.return_value = mock_snap

        mock_txn = MagicMock()
        mock_db.transaction.return_value = mock_txn

        with patch.object(L, "db", mock_db):
            with patch.object(L.firestore, "SERVER_TIMESTAMP", "SERVER_TIMESTAMP"):
                L.deduct_color_paper_usage(5)

        args, kwargs = mock_txn.update.call_args
        update_dict = args[1]
        self.assertEqual(update_dict["SV-002-COLOR.paperLevel"], 0)


if __name__ == "__main__":
    unittest.main()
