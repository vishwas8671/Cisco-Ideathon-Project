# SmartBranch 360 - Python Configuration Assurance Tool

This directory contains the Python CLI utility for static network validation. It verifies configurations against policies and the requirements plan defined in `smartbranch360.yaml`.

## Directory Structure
- `validator.py`: The executable validation script.
- `sample_config.txt`: A reference healthy Cisco IOS log configuration.
- `sample_faults/`: Seeded configuration dumps representing specific network failures.

## Verification Scenarios
The tool evaluates configurations for the following policies:
1. **VLAN Databases**: Verify Employee (10), Guest (20), Server (30), and Management (99) exist.
2. **Subinterfaces**: Ensure gateways are assigned matching design parameters.
3. **DHCP Pools**: Audit address scopes and exclude ranges.
4. **Trunks**: Check allowed trunk lists on ports Gi0/1 and Gi0/2.
5. **ACL Access**: Guest must access port 53 (DNS) on SRV1 but block all other IP traffic to VLAN 30/99.
6. **SSH VTY restrictions**: Terminals must only accept administration logins from VLAN 99.
7. **NAT overload**: Check inside/outside interface tags and mappings.

## How to Run

To run the validator against the healthy baseline configuration:
```bash
python validator.py --config sample_config.txt
```

To run it against a faulty configuration (e.g. Wrong Default Gateway):
```bash
python validator.py --config sample_faults/fault_wrong_gateway.txt
```

### Options
- `--config <path>`: Required. Path to the pasted Cisco show CLI output file.
- `--plan <path>`: Optional. Path to the design plan YAML (defaults to `../smartbranch360.yaml`).
