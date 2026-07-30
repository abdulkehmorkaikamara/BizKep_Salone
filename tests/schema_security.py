import pathlib
import sqlite3
import unittest


class SecureInventorySchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        schema = pathlib.Path("migrations/0001_secure_core.sql").read_text()
        self.db.executescript(schema)
        self.db.execute(
            "INSERT INTO businesses VALUES (?,?,?,?,?,?)",
            ("b1", "Test Pharmacy", "Pharmacy", "", "", "2026-07-30T00:00:00Z"),
        )
        self.db.execute(
            """INSERT INTO users
               (id,business_id,name,username,password_hash,password_salt,role,created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            ("u1", "b1", "Owner", "owner", "hash", "salt", "Owner", "2026-07-30T00:00:00Z"),
        )
        self.db.execute(
            """INSERT INTO products
               (id,business_id,name,sku,category,reorder_level,cost_price,selling_price,expiry,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            ("p1", "b1", "Paracetamol", "MED-001", "Pain relief", 10, 12, 20, "2027-01-01", "now", "now"),
        )
        self.db.execute(
            """INSERT INTO inventory_ledger
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("l1", "b1", "p1", "opening_stock", 50, 50, "product", "p1", "Opening stock", "u1", "u1", "now"),
        )

    def test_ledger_entries_cannot_be_edited_or_deleted(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE inventory_ledger SET quantity_delta=40 WHERE id='l1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM inventory_ledger WHERE id='l1'")

    def test_negative_inventory_is_rejected(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO inventory_ledger
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("l2", "b1", "p1", "sale", -51, -1, "sale", "s1", "Oversell", "u1", None, "now"),
            )

    def test_balance_must_match_append_only_history(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO inventory_ledger
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("l2", "b1", "p1", "sale", -10, 45, "sale", "s1", "Wrong balance", "u1", None, "now"),
            )
        self.db.execute(
            """INSERT INTO inventory_ledger
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("l3", "b1", "p1", "sale", -10, 40, "sale", "s2", "Recorded sale", "u1", None, "now"),
        )
        balance = self.db.execute(
            "SELECT SUM(quantity_delta) FROM inventory_ledger WHERE product_id='p1'"
        ).fetchone()[0]
        self.assertEqual(balance, 40)

    def test_audit_records_cannot_be_changed_or_deleted(self):
        self.db.execute(
            """INSERT INTO audit_logs
               (id,business_id,actor_user_id,action,entity_type,entity_id,created_at)
               VALUES (?,?,?,?,?,?,?)""",
            ("a1", "b1", "u1", "create", "product", "p1", "now"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE audit_logs SET action='hidden' WHERE id='a1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM audit_logs WHERE id='a1'")


if __name__ == "__main__":
    unittest.main()
