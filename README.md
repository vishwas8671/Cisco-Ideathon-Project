# SmartBranch 360 — Secure Retail Branch Design & Static Validation Tool

A comprehensive network design and automated validation utility for the Meridian Trust Bank regional retail branch expansion, ensuring strict inter-VLAN guest-to-server isolation and secure administration access compliant with banking standards.

---

## Repository Structure

```
├── config/
│   ├── site.yaml              # Declarative site network design and policies
│   └── ios-reference/         # Clean, copy-pasteable Cisco IOS configuration files
│       ├── R1.txt             # Edge Router: Subinterfaces, DHCP pools, NAT, GUEST_IN ACL
│       ├── SW1.txt            # Core Switch: VLAN databases, trunk links, SVI, SSH ACL
│       └── SW2.txt            # Access Switch: Access ports, trunks, SVI, SSH ACL
├── docs/
│   ├── design-document.md     # Detailed physical port maps, Mermaid diagram, and IP plan
│   └── fault-cards.md         # Narrative troubleshooting guides (symptom, root cause, fix)
├── validator/
│   ├── __init__.py
│   ├── main.py                # Command-line entrypoint for static validation
│   ├── parser.py              # Parsers for Cisco IOS show output dumps
│   └── rules.py               # Policy assertion checks comparing logs to site.yaml
├── samples/
│   ├── clean.txt              # Baseline clean CLI dump (yields zero findings)
│   ├── fault_wrong_gateway.txt         # Seeded fault: Incorrect gateway IP on R1 Gi0/1.10
│   ├── fault_missing_vlan_trunk.txt    # Seeded fault: Missing VLAN 20 on SW2 Gi0/2 trunk
│   ├── fault_bad_dhcp.txt              # Seeded fault: Unexcluded gateway IP in DHCP pool
│   ├── fault_acl_blocking_dns.txt      # Seeded fault: Top-down ACL rule order blocking DNS
│   ├── fault_guest_server_leak.txt     # Seeded fault: Missing guest-to-server isolation rule
│   └── fault_insecure_ssh.txt          # Seeded fault: SSH ACL permitting non-management subnets
├── tests/
│   ├── __init__.py
│   └── test_validator.py      # Python unittest suite validating all test cases
└── README.md                  # Project documentation index
```

---

## Getting Started

### Prerequisites
- Python 3.10+
- PyYAML (installed automatically if missing)

To install dependencies:
```bash
pip install pyyaml
```

### Running the Validator
The validator takes the path to the network specification (`config/site.yaml`) and a pasted text log file containing standard Cisco `show` output commands (`show ip interface brief`, `show interfaces trunk`, `show vlan brief`, `show access-lists`, and `show ip dhcp pool`):

```bash
python -m validator.main config/site.yaml samples/clean.txt
```

#### Example Output (Clean Sample)
```text
Validation Successful: 0 findings.
```

#### Example Output (With a Seeded Fault)
Executing the validator against a log file containing a fault:
```bash
python -m validator.main config/site.yaml samples/fault_acl_blocking_dns.txt
```
Output:
```text
Access Control List Blocking DNS Traffic on Router R1
Symptom: Guest clients on VLAN 20 can ping external IP addresses (e.g. 8.8.8.8) but cannot resolve domain names, resulting in web pages failing to load.
Suggested fix: Reorder the GUEST_IN ACL rules so that the permit rule for DNS (UDP port 53) to host 10.10.30.10 is evaluated before the deny rule for the Server subnet:
ip access-list extended GUEST_IN
 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
--------------------------------------------------
```

---

## Running Automated Tests
Run the unittest suite to verify the command parser and rule engine assertions against all sample files:
```bash
python -m unittest discover -s tests
```

---

## Deliverables & Execution Checklist

| Deliverable | Repository Location | Status | Packet Tracer Action / Video Demo Recording |
| :--- | :--- | :--- | :--- |
| **Topology Specification** | `docs/design-document.md` | **Ready** | Open Cisco Packet Tracer; construct physical layout following the Port Connection Map. |
| **Declarative Plan** | `config/site.yaml` | **Ready** | Source configurations and policy boundaries (gateway, DHCP ranges, VLAN tags). |
| **IOS Configuration** | `config/ios-reference/` | **Ready** | Access CLI of Router/Switches, paste configurations, and save setup (`write memory`). |
| **Log Parser / Validator** | `validator/` | **Ready** | Run local audits on pasted switch/router logs to confirm no live network leaks or misconfigurations. |
| **Fault Cards & Log Samples** | `samples/` & `docs/fault-cards.md` | **Ready** | Walk through each fault card in the 5-10 min video presentation, demonstrating how the Python tool catches them. |
| **Interactive Demo Video** | *N/A* | **Pending** | Teammate script: Demonstrate `clean` and `fault` validation; show Packet Tracer pings/SSH success. |
