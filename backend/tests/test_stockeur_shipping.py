"""
Backend tests for Assault58 Stockeur / Shipping flow (simplified single-button flow).

Covers:
- Auth (admin + stockeur cookie-based)
- GET /api/stockeur/orders returns the required fields
- Carrier resolution: _resolve_carrier keyword matching via manual order create
- POST /api/shipping/create-label with only {order_id}
- Idempotence of /api/shipping/create-label
- WooCommerce webhook extracts shipping_lines and stores shipping_method_id
"""

import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://assault58-backoffice.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@assault58.com", "password": "Admin58!Secure"}
STOCKEUR = {"email": "stockeur@leac.com", "password": "Stockeur58!Leac"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"Login failed for {creds['email']}: {r.status_code} {r.text}"
    me = s.get(f"{API}/auth/me", timeout=20)
    assert me.status_code == 200, f"/auth/me failed: {me.status_code}"
    return s


@pytest.fixture(scope="module")
def admin_client():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def stockeur_client():
    return _login(STOCKEUR)


# ---------- Auth smoke ----------
class TestAuth:
    def test_admin_login_returns_cookie(self):
        s = _login(ADMIN)
        me = s.get(f"{API}/auth/me").json()
        assert me.get("email") == ADMIN["email"]
        assert me.get("role") == "admin"

    def test_stockeur_login_role(self):
        s = _login(STOCKEUR)
        me = s.get(f"{API}/auth/me").json()
        assert me.get("role") == "stockeur"

    def test_stockeur_forbidden_on_admin_endpoint(self, stockeur_client):
        r = stockeur_client.get(f"{API}/expenses")
        assert r.status_code in (401, 403)


# ---------- Stockeur endpoint ----------
class TestStockeurOrders:
    REQUIRED_FIELDS = {
        "id", "order_number", "customer_name", "customer_email", "customer_phone",
        "shipping_address", "items", "created_at",
        "shipping_method", "shipping_method_id", "shipping_method_title",
        "tracking_number", "label_url",
    }

    def test_stockeur_orders_returns_required_fields(self, stockeur_client):
        r = stockeur_client.get(f"{API}/stockeur/orders")
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        if data:
            o = data[0]
            missing = self.REQUIRED_FIELDS - set(o.keys())
            assert not missing, f"Missing fields on stockeur order: {missing}"

    def test_admin_can_access_stockeur_orders(self, admin_client):
        r = admin_client.get(f"{API}/stockeur/orders")
        assert r.status_code == 200


# ---------- Carrier resolution via manual order creation ----------
class TestCarrierResolution:
    """Creating a manual order triggers _resolve_carrier on the backend.
    We verify the stored shipping_method_id matches the resolved value."""

    def _create_order(self, admin_client, shipping_method_id="", shipping_method_title=""):
        payload = {
            "customer_name": f"TEST_Cust_{uuid.uuid4().hex[:6]}",
            "customer_email": "test@test.fr",
            "customer_phone": "+33600000000",
            "shipping_address": "10 rue des Tests, 75001 Paris",
            "items": [{"product_id": "", "product_name": "Lampe", "quantity": 1, "unit_price": 29.9}],
            "total_amount": 29.9,
            "status": "pending",
            "source": "manual",
            "shipping_method_id": shipping_method_id,
            "shipping_method_title": shipping_method_title,
            "shipping_method": shipping_method_title or shipping_method_id,
        }
        r = admin_client.post(f"{API}/orders", json=payload)
        assert r.status_code in (200, 201), f"create order failed: {r.status_code} {r.text}"
        return r.json()

    def test_explicit_mondial_relay_id(self, admin_client):
        o = self._create_order(admin_client, shipping_method_id="mondial_relay")
        assert o["shipping_method_id"] == "mondial_relay"

    def test_chronopost_title_resolves(self, admin_client):
        o = self._create_order(admin_client, shipping_method_title="Livraison Chronopost 13h")
        assert o["shipping_method_id"] == "chronopost_13", o

    def test_colissimo_relay_title_resolves(self, admin_client):
        o = self._create_order(admin_client, shipping_method_title="Point Relais Colissimo")
        assert o["shipping_method_id"] == "colissimo_relay", o

    def test_mondial_relay_title_resolves(self, admin_client):
        o = self._create_order(admin_client, shipping_method_title="Mondial Relay")
        assert o["shipping_method_id"] == "mondial_relay", o

    def test_default_fallback_colissimo_home(self, admin_client):
        o = self._create_order(admin_client, shipping_method_title="")
        assert o["shipping_method_id"] == "colissimo_home", o


# ---------- Shipping label creation ----------
class TestShippingLabel:
    def _create_pending_order(self, admin_client, method_id="mondial_relay"):
        payload = {
            "customer_name": f"TEST_Ship_{uuid.uuid4().hex[:6]}",
            "customer_email": "ship@test.fr",
            "customer_phone": "+33600000001",
            "shipping_address": "20 rue des Livraisons, 69002 Lyon",
            "items": [{"product_id": "", "product_name": "Flashlight", "quantity": 1, "unit_price": 59.0}],
            "total_amount": 59.0,
            "status": "pending",
            "source": "manual",
            "shipping_method_id": method_id,
            "shipping_method_title": method_id,
            "shipping_method": method_id,
        }
        r = admin_client.post(f"{API}/orders", json=payload)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_create_label_with_only_order_id(self, admin_client, stockeur_client):
        order = self._create_pending_order(admin_client, "chronopost_13")
        oid = order["id"]
        # stockeur calls with ONLY order_id (no carrier_id)
        r = stockeur_client.post(f"{API}/shipping/create-label", json={"order_id": oid})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("tracking_number"), data
        assert data.get("carrier_id") == "chronopost_13", data
        assert data.get("source") in ("simulation", "boxtal_api")
        # Simulation path expected per spec
        assert data.get("already_generated") is not True

    def test_create_label_idempotent(self, admin_client, stockeur_client):
        order = self._create_pending_order(admin_client, "colissimo_relay")
        oid = order["id"]
        r1 = stockeur_client.post(f"{API}/shipping/create-label", json={"order_id": oid})
        assert r1.status_code == 200, r1.text
        tn1 = r1.json()["tracking_number"]
        # Second call should be idempotent
        r2 = stockeur_client.post(f"{API}/shipping/create-label", json={"order_id": oid})
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("already_generated") is True, d2
        assert d2.get("tracking_number") == tn1, d2

    def test_create_label_resolves_carrier_from_title_only(self, admin_client, stockeur_client):
        # Create order via woo-like path: empty id, only title
        payload = {
            "customer_name": f"TEST_T_{uuid.uuid4().hex[:6]}",
            "customer_email": "t@t.fr",
            "customer_phone": "0600000000",
            "shipping_address": "1 rue, 75001 Paris",
            "items": [{"product_id": "", "product_name": "x", "quantity": 1, "unit_price": 10}],
            "total_amount": 10,
            "status": "pending",
            "source": "manual",
            "shipping_method_id": "",
            "shipping_method_title": "Livraison Chronopost 13h Express",
            "shipping_method": "Livraison Chronopost 13h Express",
        }
        r = admin_client.post(f"{API}/orders", json=payload)
        assert r.status_code in (200, 201)
        oid = r.json()["id"]
        lbl = stockeur_client.post(f"{API}/shipping/create-label", json={"order_id": oid})
        assert lbl.status_code == 200, lbl.text
        assert lbl.json().get("carrier_id") == "chronopost_13"


# ---------- WooCommerce webhook extraction ----------
class TestWooWebhook:
    def test_webhook_stores_shipping_method_from_shipping_lines(self, admin_client):
        woo_id = 99_000_000 + (int.from_bytes(os.urandom(2), "big"))
        payload = {
            "id": woo_id,
            "number": str(woo_id),
            "status": "processing",
            "total": "42.50",
            "date_created": "2026-01-01T10:00:00",
            "billing": {
                "first_name": "TEST", "last_name": "Webhook",
                "email": "wh@test.fr", "phone": "+33600000099",
                "address_1": "5 rue Test", "postcode": "75002", "city": "Paris"
            },
            "shipping": {"address_1": "5 rue Test", "postcode": "75002", "city": "Paris"},
            "shipping_lines": [
                {"method_id": "mondial_relay", "method_title": "Mondial Relay - Point Relais"}
            ],
            "line_items": [{"name": "Flashlight Pro", "quantity": 1, "price": "42.50"}],
        }
        # No auth on webhook — simulate WC hitting it directly
        r = requests.post(
            f"{API}/woocommerce/webhook",
            json=payload,
            headers={"X-WC-Webhook-Topic": "order.created"},
            timeout=20,
        )
        assert r.status_code in (200, 201), f"webhook failed: {r.status_code} {r.text}"

        # Verify via stockeur/orders (admin allowed)
        orders = admin_client.get(f"{API}/stockeur/orders").json()
        found = next((o for o in orders if o.get("order_number") == f"WOO-{woo_id}"), None)
        assert found is not None, "Webhook order not found in stockeur list"
        assert found["shipping_method_id"] == "mondial_relay", found
        assert "Mondial Relay" in (found.get("shipping_method_title") or ""), found
