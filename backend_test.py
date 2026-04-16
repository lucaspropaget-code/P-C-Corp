#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Assault58 Back-Office
Tests all endpoints with proper authentication and role-based access
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class Assault58APITester:
    def __init__(self, base_url="https://assault58-backoffice.preview.emergentagent.com"):
        self.base_url = base_url
        self.sessions = {}  # Separate session for each role
        self.users = {}
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test credentials
        self.credentials = {
            "admin": {"email": "admin@assault58.com", "password": "Admin58!Secure"},
            "stockeur": {"email": "stockeur@leac.com", "password": "Stockeur58!Leac"},
            "marketing": {"email": "marketing@assault58.com", "password": "Marketing58!Pro"}
        }
        
        # Create separate sessions for each role
        for role in self.credentials.keys():
            self.sessions[role] = requests.Session()

    def log_test(self, name: str, success: bool, details: str = "", response_data: Any = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details,
            "response_data": response_data
        })

    def make_request(self, method: str, endpoint: str, data: dict = None, 
                    expected_status: int = 200, role: str = None) -> tuple[bool, dict]:
        """Make API request with proper authentication"""
        url = f"{self.base_url}/api{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        # Use the appropriate session for the role (with cookies)
        session = self.sessions.get(role, requests.Session()) if role else requests.Session()
        
        try:
            if method == 'GET':
                response = session.get(url, headers=headers)
            elif method == 'POST':
                response = session.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = session.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = session.delete(url, headers=headers)
            else:
                return False, {"error": f"Unsupported method: {method}"}

            success = response.status_code == expected_status
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text[:200]}
            
            return success, response_data

        except Exception as e:
            return False, {"error": str(e)}

    def test_auth_login(self, role: str) -> bool:
        """Test login for specific role"""
        creds = self.credentials[role]
        
        # Use the role-specific session for login
        session = self.sessions[role]
        url = f"{self.base_url}/api/auth/login"
        
        try:
            response = session.post(url, json=creds)
            success = response.status_code == 200
            
            if success:
                response_data = response.json()
                if 'id' in response_data:
                    self.users[role] = response_data
                    self.log_test(f"Login {role}", True, f"User: {response_data.get('name')}")
                    return True
            
            self.log_test(f"Login {role}", False, f"Status: {response.status_code}, Response: {response.text[:200]}")
            return False
            
        except Exception as e:
            self.log_test(f"Login {role}", False, f"Error: {str(e)}")
            return False

    def test_auth_me(self, role: str) -> bool:
        """Test /auth/me endpoint"""
        success, response = self.make_request('GET', '/auth/me', role=role)
        
        if success and response.get('role') == role:
            self.log_test(f"Auth/me {role}", True, f"Role verified: {response.get('role')}")
            return True
        else:
            self.log_test(f"Auth/me {role}", False, f"Response: {response}")
            return False

    def test_dashboard_stats(self, role: str) -> bool:
        """Test dashboard stats (Admin + Marketing)"""
        if role not in ['admin', 'marketing']:
            return True  # Skip for stockeur
            
        success, response = self.make_request('GET', '/dashboard/stats', role=role)
        
        if success and 'revenue' in response:
            self.log_test(f"Dashboard stats {role}", True, 
                         f"Revenue month: {response['revenue'].get('month', 0)}€")
            return True
        else:
            self.log_test(f"Dashboard stats {role}", False, f"Response: {response}")
            return False

    def test_revenue_trend(self, role: str) -> bool:
        """Test revenue trend endpoint"""
        if role not in ['admin', 'marketing']:
            return True
            
        success, response = self.make_request('GET', '/dashboard/revenue-trend?days=7', role=role)
        
        if success and isinstance(response, list):
            self.log_test(f"Revenue trend {role}", True, f"Data points: {len(response)}")
            return True
        else:
            self.log_test(f"Revenue trend {role}", False, f"Response: {response}")
            return False

    def test_products_crud(self, role: str) -> bool:
        """Test products CRUD operations (Admin only)"""
        if role != 'admin':
            return True
            
        # Get products
        success, products = self.make_request('GET', '/products', role=role)
        if not success:
            self.log_test(f"Get products {role}", False, f"Response: {products}")
            return False
        
        self.log_test(f"Get products {role}", True, f"Found {len(products)} products")
        
        # Create product
        new_product = {
            "name": "Test Product",
            "sku": f"TEST-{datetime.now().strftime('%H%M%S')}",
            "description": "Test product for API testing",
            "price": 99.99,
            "quantity": 10,
            "alert_threshold": 5,
            "category": "Test"
        }
        
        success, created = self.make_request('POST', '/products', data=new_product, 
                                           expected_status=200, role=role)
        if success and 'id' in created:
            product_id = created['id']
            self.log_test(f"Create product {role}", True, f"Created ID: {product_id}")
            
            # Update product
            update_data = {"price": 89.99, "quantity": 15}
            success, updated = self.make_request('PUT', f'/products/{product_id}', 
                                               data=update_data, role=role)
            if success:
                self.log_test(f"Update product {role}", True, f"Updated price: {updated.get('price')}")
            else:
                self.log_test(f"Update product {role}", False, f"Response: {updated}")
            
            # Delete product
            success, deleted = self.make_request('DELETE', f'/products/{product_id}', role=role)
            if success:
                self.log_test(f"Delete product {role}", True, "Product deleted")
            else:
                self.log_test(f"Delete product {role}", False, f"Response: {deleted}")
            
            return True
        else:
            self.log_test(f"Create product {role}", False, f"Response: {created}")
            return False

    def test_orders_management(self, role: str) -> bool:
        """Test orders management (Admin only)"""
        if role != 'admin':
            return True
            
        # Get orders
        success, orders = self.make_request('GET', '/orders', role=role)
        if success:
            self.log_test(f"Get orders {role}", True, f"Found {len(orders)} orders")
            
            # Test order status update if orders exist
            if orders and len(orders) > 0:
                order_id = orders[0]['id']
                status_update = {"status": "pending"}
                success, updated = self.make_request('PUT', f'/orders/{order_id}/status', 
                                                   data=status_update, role=role)
                if success:
                    self.log_test(f"Update order status {role}", True, "Status updated")
                else:
                    self.log_test(f"Update order status {role}", False, f"Response: {updated}")
            
            return True
        else:
            self.log_test(f"Get orders {role}", False, f"Response: {orders}")
            return False

    def test_stockeur_orders(self, role: str) -> bool:
        """Test stockeur specific orders endpoint"""
        if role not in ['stockeur', 'admin']:
            return True
            
        success, orders = self.make_request('GET', '/stockeur/orders', role=role)
        if success:
            self.log_test(f"Stockeur orders {role}", True, f"Found {len(orders)} pending orders")
            return True
        else:
            self.log_test(f"Stockeur orders {role}", False, f"Response: {orders}")
            return False

    def test_customers_crud(self, role: str) -> bool:
        """Test customers CRUD (Admin only)"""
        if role != 'admin':
            return True
            
        # Get customers
        success, customers = self.make_request('GET', '/customers', role=role)
        if success:
            self.log_test(f"Get customers {role}", True, f"Found {len(customers)} customers")
            
            # Create customer
            new_customer = {
                "name": "Test Customer",
                "email": f"test{datetime.now().strftime('%H%M%S')}@test.com",
                "phone": "06 12 34 56 78",
                "address": "Test Address"
            }
            
            success, created = self.make_request('POST', '/customers', data=new_customer, role=role)
            if success and 'id' in created:
                customer_id = created['id']
                self.log_test(f"Create customer {role}", True, f"Created ID: {customer_id}")
                
                # Delete customer
                success, deleted = self.make_request('DELETE', f'/customers/{customer_id}', role=role)
                if success:
                    self.log_test(f"Delete customer {role}", True, "Customer deleted")
                else:
                    self.log_test(f"Delete customer {role}", False, f"Response: {deleted}")
                
                return True
            else:
                self.log_test(f"Create customer {role}", False, f"Response: {created}")
                return False
        else:
            self.log_test(f"Get customers {role}", False, f"Response: {customers}")
            return False

    def test_accounting(self, role: str) -> bool:
        """Test accounting endpoints (Admin only)"""
        if role != 'admin':
            return True
            
        # Get expenses
        success, expenses = self.make_request('GET', '/expenses', role=role)
        if success:
            self.log_test(f"Get expenses {role}", True, f"Found {len(expenses)} expenses")
            
            # Create expense
            new_expense = {
                "description": "Test Expense",
                "amount": 50.0,
                "category": "Test",
                "notes": "API test expense"
            }
            
            success, created = self.make_request('POST', '/expenses', data=new_expense, role=role)
            if success and 'id' in created:
                expense_id = created['id']
                self.log_test(f"Create expense {role}", True, f"Created ID: {expense_id}")
                
                # Delete expense
                success, deleted = self.make_request('DELETE', f'/expenses/{expense_id}', role=role)
                if success:
                    self.log_test(f"Delete expense {role}", True, "Expense deleted")
                else:
                    self.log_test(f"Delete expense {role}", False, f"Response: {deleted}")
                
                return True
            else:
                self.log_test(f"Create expense {role}", False, f"Response: {created}")
                return False
        else:
            self.log_test(f"Get expenses {role}", False, f"Response: {expenses}")
            return False

    def test_woocommerce_settings(self, role: str) -> bool:
        """Test WooCommerce settings (Admin only)"""
        if role != 'admin':
            return True
            
        # Get settings
        success, settings = self.make_request('GET', '/settings/woocommerce', role=role)
        if success:
            self.log_test(f"Get WooCommerce settings {role}", True, "Settings retrieved")
            return True
        else:
            self.log_test(f"Get WooCommerce settings {role}", False, f"Response: {settings}")
            return False

    def test_ai_content(self, role: str) -> bool:
        """Test AI content generation (Marketing + Admin)"""
        if role not in ['marketing', 'admin']:
            return True
            
        ai_request = {
            "prompt": "Créer un post Instagram pour promouvoir nos lampes torches tactiques",
            "content_type": "social_post"
        }
        
        success, response = self.make_request('POST', '/ai/generate-content', 
                                            data=ai_request, role=role)
        if success and 'content' in response:
            content_length = len(response['content'])
            self.log_test(f"AI content generation {role}", True, 
                         f"Generated {content_length} characters")
            return True
        else:
            self.log_test(f"AI content generation {role}", False, f"Response: {response}")
            return False

    def test_role_access_control(self):
        """Test role-based access control"""
        print("\n🔒 Testing Role-Based Access Control...")
        
        # Test stockeur trying to access admin endpoints
        success, response = self.make_request('GET', '/products', role='stockeur', expected_status=403)
        if response.get('detail') == 'Accès non autorisé':
            self.log_test("Stockeur blocked from products", True, "Access denied correctly")
        else:
            self.log_test("Stockeur blocked from products", False, f"Should be blocked: {response}")
        
        # Test marketing trying to access admin-only endpoints
        success, response = self.make_request('GET', '/customers', role='marketing', expected_status=403)
        if response.get('detail') == 'Accès non autorisé':
            self.log_test("Marketing blocked from customers", True, "Access denied correctly")
        else:
            self.log_test("Marketing blocked from customers", False, f"Should be blocked: {response}")

    def run_comprehensive_test(self):
        """Run all tests for all roles"""
        print("🚀 Starting Assault58 Back-Office API Testing...")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Test authentication for all roles
        print("\n🔐 Testing Authentication...")
        auth_success = {}
        for role in self.credentials.keys():
            auth_success[role] = self.test_auth_login(role)
            if auth_success[role]:
                self.test_auth_me(role)
        
        # Only continue if at least admin login works
        if not auth_success.get('admin'):
            print("❌ Admin login failed - cannot continue with tests")
            return False
        
        # Test endpoints for each role
        for role in ['admin', 'marketing', 'stockeur']:
            if not auth_success.get(role):
                continue
                
            print(f"\n👤 Testing {role.upper()} Role...")
            
            # Dashboard & Stats
            self.test_dashboard_stats(role)
            self.test_revenue_trend(role)
            
            # Role-specific endpoints
            if role == 'admin':
                self.test_products_crud(role)
                self.test_orders_management(role)
                self.test_customers_crud(role)
                self.test_accounting(role)
                self.test_woocommerce_settings(role)
            
            if role in ['stockeur', 'admin']:
                self.test_stockeur_orders(role)
            
            if role in ['marketing', 'admin']:
                self.test_ai_content(role)
        
        # Test access control
        if auth_success.get('stockeur') and auth_success.get('marketing'):
            self.test_role_access_control()
        
        return True

    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed}")
        print(f"Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        # Show failed tests
        failed_tests = [t for t in self.test_results if not t['success']]
        if failed_tests:
            print(f"\n❌ Failed Tests ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['name']}: {test['details']}")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    tester = Assault58APITester()
    
    try:
        success = tester.run_comprehensive_test()
        tester.print_summary()
        
        # Return appropriate exit code
        return 0 if success and tester.tests_passed == tester.tests_run else 1
        
    except Exception as e:
        print(f"❌ Test execution failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())