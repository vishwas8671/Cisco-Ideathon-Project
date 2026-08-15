import unittest
import os
import yaml
import sys

# Ensure package directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from validator.parser import CommandParser
from validator.rules import RuleEngine

class TestValidator(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cls.yaml_path = os.path.join(cls.base_dir, "config", "site.yaml")
        
        with open(cls.yaml_path, 'r') as f:
            cls.site_config = yaml.safe_load(f)

    def run_validation(self, sample_filename):
        sample_path = os.path.join(self.base_dir, "samples", sample_filename)
        parser = CommandParser()
        parsed_data = parser.parse_file(sample_path)
        engine = RuleEngine(self.site_config, parsed_data)
        return engine.run_all_checks()

    def test_clean_sample(self):
        findings = self.run_validation("clean.txt")
        self.assertEqual(len(findings), 0, f"Clean sample should have 0 findings, but got: {findings}")

    def test_wrong_gateway(self):
        findings = self.run_validation("fault_wrong_gateway.txt")
        self.assertGreater(len(findings), 0)
        # Check if the wrong gateway issue was flagged
        wrong_gateway_flagged = any("wrong gateway" in f["summary"].lower() for f in findings)
        self.assertTrue(wrong_gateway_flagged, "Should flag 'Wrong Gateway' on R1 sub-interface")

    def test_missing_vlan_trunk(self):
        findings = self.run_validation("fault_missing_vlan_trunk.txt")
        self.assertGreater(len(findings), 0)
        # Check if missing VLAN on trunk is flagged
        missing_vlan_flagged = any("missing" in f["summary"].lower() and "trunk" in f["summary"].lower() for f in findings)
        self.assertTrue(missing_vlan_flagged, "Should flag missing VLAN on trunk interface of SW2")

    def test_bad_dhcp(self):
        findings = self.run_validation("fault_bad_dhcp.txt")
        self.assertGreater(len(findings), 0)
        # Check if DHCP scope conflict is flagged
        dhcp_conflict_flagged = any("dhcp" in f["summary"].lower() and "conflict" in f["summary"].lower() for f in findings)
        self.assertTrue(dhcp_conflict_flagged, "Should flag DHCP gateway exclusion scope conflict")

    def test_acl_blocking_dns(self):
        findings = self.run_validation("fault_acl_blocking_dns.txt")
        self.assertGreater(len(findings), 0)
        # Check if ACL blocking DNS is flagged
        dns_blocked_flagged = any("dns" in f["summary"].lower() and "block" in f["summary"].lower() for f in findings)
        self.assertTrue(dns_blocked_flagged, "Should flag ACL blocking DNS queries")

    def test_guest_server_leak(self):
        findings = self.run_validation("fault_guest_server_leak.txt")
        self.assertGreater(len(findings), 0)
        # Check if guest-to-server leak is flagged
        leak_flagged = any("leak" in f["summary"].lower() for f in findings)
        self.assertTrue(leak_flagged, "Should flag guest-server security policy leak")

    def test_insecure_ssh(self):
        findings = self.run_validation("fault_insecure_ssh.txt")
        self.assertGreater(len(findings), 0)
        # Check if insecure SSH is flagged
        ssh_flagged = any("ssh" in f["summary"].lower() and "non-management" in f["summary"].lower() for f in findings)
        self.assertTrue(ssh_flagged, "Should flag insecure SSH access on SW1")

if __name__ == "__main__":
    unittest.main()
