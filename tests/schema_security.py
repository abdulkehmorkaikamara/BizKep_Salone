import pathlib
import sqlite3
import unittest


class SecureInventorySchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        for migration in sorted(pathlib.Path("migrations").glob("*.sql")):
            self.db.executescript(migration.read_text())
        self.db.execute(
            "INSERT INTO businesses (id,name,type,phone,address,created_at) VALUES (?,?,?,?,?,?)",
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

    def test_offline_sales_may_take_stock_below_zero(self):
        self.db.execute(
            """INSERT INTO inventory_ledger
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("l2", "b1", "p1", "offline_sale", -52, -2, "sale", "s1", "Offline", "u1", None, "now"),
        )
        # Further stock reductions stay blocked while the balance is negative...
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                """INSERT INTO inventory_ledger
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                ("l3", "b1", "p1", "damage", -1, -3, "adjustment", "a1", "Damaged", "u1", "u1", "now"),
            )
        # ...but a restock that only partly covers the shortfall is allowed.
        self.db.execute(
            """INSERT INTO inventory_ledger
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("l4", "b1", "p1", "purchase", 1, -1, "adjustment", "a2", "Restock", "u1", "u1", "now"),
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

    def test_sales_only_change_by_voiding_once(self):
        self.db.execute(
            """INSERT INTO sales
               (id,business_id,subtotal,discount,total,cash_amount,recorded_by,sale_date,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            ("s1", "b1", 40, 0, 40, 40, "u1", "2026-10-04", "now"),
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE sales SET total=10, cash_amount=10 WHERE id='s1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM sales WHERE id='s1'")
        self.db.execute("UPDATE sales SET status='voided' WHERE id='s1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE sales SET status='voided' WHERE id='s1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE sales SET status='completed' WHERE id='s1'")

    def test_closed_shifts_are_final(self):
        self.db.execute(
            "INSERT INTO shifts (id,business_id,user_id,opened_at,opening_float) VALUES ('sh1','b1','u1','t1',100)"
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO shifts (id,business_id,user_id,opened_at,opening_float) VALUES ('sh2','b1','u1','t2',0)"
            )
        self.db.execute(
            """UPDATE shifts SET status='closed', closed_at='t3', expected_cash=120, expected_orange=0,
               expected_afrimoney=0, counted_cash=115, counted_orange=0, counted_afrimoney=0 WHERE id='sh1'"""
        )
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("UPDATE shifts SET counted_cash=120 WHERE id='sh1'")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("DELETE FROM shifts WHERE id='sh1'")

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

    def add_protected_records(self, business_id):
        self.db.execute(
            """INSERT INTO sales
               (id,business_id,subtotal,discount,total,cash_amount,recorded_by,sale_date,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            ("s1", business_id, 40, 0, 40, 40, "u1", "2026-10-04", "now"),
        )
        self.db.execute(
            "INSERT INTO shifts (id,business_id,user_id,opened_at,opening_float) VALUES (?,?,?,?,?)",
            ("sh1", business_id, "u1", "t1", 0),
        )
        self.db.execute(
            """INSERT INTO audit_logs (id,business_id,actor_user_id,action,entity_type,entity_id,created_at)
               VALUES (?,?,?,?,?,?,?)""",
            ("a1", business_id, "u1", "create", "product", "p1", "now"),
        )

    def delete_protected_records(self, business_id):
        for table in ("sales", "shifts", "inventory_ledger", "audit_logs"):
            self.db.execute(f"DELETE FROM {table} WHERE business_id=?", (business_id,))

    def test_closing_another_business_does_not_unlock_deletes(self):
        self.add_protected_records("b1")
        self.db.execute(
            "INSERT INTO businesses (id,name,type,phone,address,created_at,closing_at) VALUES ('b2','Other','Shop','','','now','now')"
        )
        for table in ("sales", "shifts", "inventory_ledger", "audit_logs"):
            with self.assertRaises(sqlite3.IntegrityError, msg=table):
                self.db.execute(f"DELETE FROM {table} WHERE business_id='b1'")

    def test_a_closing_business_can_erase_its_records(self):
        self.add_protected_records("b1")
        self.db.execute("UPDATE businesses SET closing_at='now' WHERE id='b1'")
        self.delete_protected_records("b1")
        for table in ("sales", "shifts", "inventory_ledger", "audit_logs"):
            self.assertEqual(self.db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0, table)

    def test_staff_accounts_record_when_they_were_deleted(self):
        columns = {row[1] for row in self.db.execute("PRAGMA table_info(users)")}
        self.assertIn("deleted_at", columns)

    def test_owner_otp_recovery_columns_are_present(self):
        columns = {
            row[1] for row in self.db.execute("PRAGMA table_info(users)").fetchall()
        }
        self.assertTrue(
            {"totp_pending_secret", "totp_secret", "totp_enabled_at"} <= columns
        )

    def test_restaurant_mode_is_backward_compatible(self):
        product = self.db.execute(
            "SELECT product_type FROM products WHERE id='p1'"
        ).fetchone()
        self.assertEqual(product[0], "retail")
        sale_columns = {
            row[1] for row in self.db.execute("PRAGMA table_info(sales)").fetchall()
        }
        self.assertTrue(
            {
                "order_type",
                "table_name",
                "customer_name",
                "customer_phone",
                "order_source",
            }
            <= sale_columns
        )

    def test_restaurant_enums_reject_invalid_values(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "UPDATE products SET product_type='invalid' WHERE id='p1'"
            )


if __name__ == "__main__":
    unittest.main()
