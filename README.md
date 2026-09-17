# SmartBranch 360 — Secure Retail Branch Design & Static Validation Tool

SmartBranch 360 is an automated network design and configuration assurance utility built for the **Meridian Trust Bank** regional retail branch expansion. It ensures strict inter-VLAN guest isolation, secure administrator access, local server DNS resolution, and lab WAN internet routing compliant with Cisco Enterprise and banking security standards.

---


## 1. Problem Statement
Retail banking branches require robust network segmentation to protect sensitive financial transactions, employee databases, and internal device terminals from public exposure. The branch network must support:
- **Segmentation**: VLANs separating Teller/Employee, Guest, Server, and Management traffic.
- **Access Control**: A guest Wi-Fi network that reaches the Internet but is blocked from accessing protected local subnets (VLAN 30/99) except for DNS lookup resolution (UDP port 53).
- **Secure Management**: Restricting SSH access to device CLI shells exclusively to the Management network.
- **Service Assurance**: Standard DHCP leasing, internal/external DNS resolution, and NAT overload translation at the edge WAN.

---

## 2. Repository Structure
```
├── smartbranch360.yaml        # Master declarative site configuration plan
├── README.md                  # Project documentation index (this file)
├── config/
│   ├── site.yaml              # Legacy declarative site configuration
│   └── ios-reference/         # Cisco IOS reference configuration files
│       ├── R1.txt             # Edge Router: Subinterfaces, DHCP pools, NAT, GUEST_IN ACL
│       ├── SW1.txt            # Core Switch: VLAN databases, trunk links, SVI, SSH ACL
│       └── SW2.txt            # Access Switch: Access ports, trunks, SVI, SSH ACL
├── docs/
│   ├── design-document.md     # Detailed physical port maps, Mermaid diagram, and IP plan
│   └── fault-cards.md         # Narrative troubleshooting guides (symptom, root cause, fix)
├── python-validator/          # Standalone python assurance CLI utility
│   ├── validator.py           # Self-contained audit script matching smartbranch360.yaml
│   ├── sample_config.txt      # Healthy reference configuration logs
│   ├── sample_faults/         # Seeded config logs for Faults 1-5
│   └── README.md              # Instructions for running validator.py
├── validator/                 # Legacy python validator module
│   ├── parser.py
│   ├── rules.py
│   └── main.py
├── tests/
│   └── test_validator.py      # Python unittest suite validating legacy test cases
└── web/
    ├── index.html             # Upgraded 11-tab interactive dashboard UI
    ├── app.js                 # Interactive logic, parser, and Fault Injection Lab SVI
    └── style.css              # Custom styling with glassmorphism and responsiveness
```

---

## 3. Network Topology Map
The branch office layout consists of:
- **R1 Router (Cisco 2911)**: Edge gateway with subinterfaces (RoaS), DHCP scopes, NAT PAT translation, default routing, and ACL traffic filters.
- **SW1 Core Switch (Cisco 2960)**: Core distribution switch supporting tellers, servers, and administrators.
- **SW2 Access Switch (Cisco 2960)**: Access switch supporting general employee PCs and the lobby wireless AP.
- **AP-01 Wireless AP**: Lobby guest Wi-Fi hotspot bridge mapped to VLAN 20.
- **SRV-DNS-WEB**: Static branch server (10.10.30.10) hosting DNS and local bank databases.
- **8 Endpoints**: `Employee-PC01`, `Employee-PC02`, `Employee-PC03`, `Employee-PC04`, `Guest-PC01`, `Guest-PC02`, `Management-PC01`, and `Management-PC02`.

```
                    [ ISP Cloud / Internet ]
                               | (WAN GigabitEthernet 0/0: 203.0.113.1/30)
                               |
                        [ R1 Router ]
                               | (Trunk GigabitEthernet 0/1: 802.1Q Allowed VLANs 10,20,30,99)
                               |
                        [ SW1 Core Switch ]
                       /       |         \
         (VLAN 99 Admin) (VLAN 30 Server) (Trunk Gi0/2: Allowed 10,20,30,99)
               |               |           \
         Management-PC01  SRV-DNS-WEB    [ SW2 Access Switch ]
         Management-PC02                 /                   \
                               (VLAN 10 Employee)     (VLAN 20 Guest AP)
                                      |                       |
                                Employee-PC03               AP-01
                                Employee-PC04              /     \
                                                     Guest-PC01  Guest-PC02
```

---

## 4. VLAN & IP Addressing Plan

| Device | Interface | VLAN | IP Address | Subnet Mask | Default Gateway | Role / Subnet Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **R1** | `Gi0/0` | N/A | `203.0.113.2` | `255.255.255.252` | `203.0.113.1` | Edge WAN Interface (NAT Outside) |
| **R1** | `Gi0/1.10` | 10 | `10.10.10.1` | `255.255.255.0` | N/A | Employee Subnet Gateway (NAT Inside) |
| **R1** | `Gi0/1.20` | 20 | `10.10.20.1` | `255.255.255.0` | N/A | Guest Subnet Gateway (NAT Inside) |
| **R1** | `Gi0/1.30` | 30 | `10.10.30.1` | `255.255.255.0` | N/A | Server Subnet Gateway (NAT Inside) |
| **R1** | `Gi0/1.99` | 99 | `10.10.99.1` | `255.255.255.0` | N/A | Management Subnet Gateway (NAT Inside) |
| **SW1** | `Vlan99` | 99 | `10.10.99.2` | `255.255.255.0` | `10.10.99.1` | Switch Management SVI |
| **SW2** | `Vlan99` | 99 | `10.10.99.3` | `255.255.255.0` | `10.10.99.1` | Switch Management SVI |
| **SRV-DNS-WEB**| `Fa0` | 30 | `10.10.30.10` | `255.255.255.0` | `10.10.30.1` | Static Server SVI |
| **Workstations**| DHCP | 10/20/99 | Leased Range | `255.255.255.0` | Matching Gateway | DHCP Client Range |

---

## 5. Security & Isolation Matrix

| Policy ID | Source | Destination | Protocol | Port | Action | Purpose / Compliance Details |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | VLAN 20 Guest | VLAN 30 Server | IP | Any | **DENY** | Blocks Guest access to secure database servers |
| **SEC-02** | VLAN 20 Guest | VLAN 99 Management | IP | Any | **DENY** | Blocks Guest access to network switch SVIs |
| **SEC-03** | VLAN 20 Guest | SRV-DNS-WEB (10.10.30.10) | UDP | 53 | **PERMIT** | Allows guest Wi-Fi clients to query internal DNS |
| **SEC-04** | VLAN 10 Employee| VLAN 30 Server | IP | Any | **PERMIT** | Allows tellers to access bank transactions database |
| **SEC-05** | VLAN 10 Employee| Internet | IP | Any | **PERMIT** | Permits internet browsing (NAT PAT overload) |
| **SEC-06** | VLAN 20 Guest | Internet | IP | Any | **PERMIT** | Permits guest internet access (NAT PAT overload) |
| **SEC-07** | VLAN 99 Management| R1, SW1, SW2 SVI | TCP | 22 (SSH)| **PERMIT** | Allows secure SSH command-line management |
| **SEC-08** | VLAN 10 Employee| R1, SW1, SW2 SVI | TCP | 22 (SSH)| **DENY** | Restricts admin console access (VTY access-class) |
| **SEC-09** | VLAN 20 Guest | R1, SW1, SW2 SVI | TCP | 22 (SSH)| **DENY** | Restricts admin console access (VTY access-class) |

---

## 6. Interactive Troubleshooting Fault Cards

We have configured 5 distinct network failure scenarios:
1. **FAULT-01: Wrong Default Gateway**
   - *Symptom*: Employee PC cannot ping gateway or reach external resources.
   - *Root Cause*: R1 subinterface `Gi0/1.10` has wrong IP address `10.10.10.2`.
   - *Suggested Fix*: Configure SVI IP on R1 to `10.10.10.1`.
2. **FAULT-02: Missing VLAN on Trunk**
   - *Symptom*: Guest clients connected to SW2 AP fail to lease an IP address (APIPA timeout).
   - *Root Cause*: VLAN 20 is not permitted on SW2 trunk interface `Gi0/2`.
   - *Suggested Fix*: Add VLAN 20 to the trunk allowed vlan list.
3. **FAULT-03: DHCP Pool Subnet Mismatch**
   - *Symptom*: Guest workstations do not receive IP configurations.
   - *Root Cause*: R1 DHCP pool `Guest-Pool` is missing from the configuration.
   - *Suggested Fix*: Configure `ip dhcp pool Guest-Pool` with network subnet `10.10.20.0/24`.
4. **FAULT-04: ACL Blocking DNS Traffic**
   - *Symptom*: Guest clients can ping external IPs directly (8.8.8.8) but cannot browse domains.
   - *Root Cause*: GUEST_IN deny rules block VLAN 30 range before evaluation of the permit DNS UDP/53 rule.
   - *Suggested Fix*: Permit UDP port 53 before denying IP access to VLAN 30 range.
5. **FAULT-05: NAT Overload Rule Failure**
   - *Symptom*: Clients can routing packets to gateways but cannot reach public networks (WAN).
   - *Root Cause*: Inside/outside NAT interface configurations or PAT overload rules are missing.
   - *Suggested Fix*: Assign `ip nat inside` and `outside` tags and map inside sources overload via WAN.

---

## 7. Standalone Python Validator Tool
A standalone CLI tool is programmed inside the `/python-validator/` directory.

### Requirements
- Python 3.10+
- PyYAML (installed via `pip install pyyaml`)

### How to Run Validation
Navigate to the directory and run the validator script:
```bash
# Go to the python-validator folder
cd python-validator

# Validate against healthy configuration logs
python validator.py --config sample_config.txt

# Validate against a faulty log
python validator.py --config sample_faults/fault_wrong_gateway.txt
```

---

## 8. GitHub Pages Web Deployment
The repository includes a web dashboard that maps the design and contains an interactive **Fault Injection Lab** demonstrating the troubleshooting workflow.

### How to Deploy
1. Navigate to **Settings** > **Pages** in this GitHub repository settings dashboard.
2. Select **GitHub Actions** as the build and deployment source.
3. Push changes to the `main` branch to trigger the action automatically.
4. Access your live website at: `https://vishwas8671.github.io/Cisco-Ideathon-Project/`.
