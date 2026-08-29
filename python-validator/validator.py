#!/usr/bin/env python3
import sys
import os
import re
import argparse
import yaml

# Helper function to parse VLAN lists/ranges (e.g. '10,20,30-33,99')
def parse_vlan_ranges(vlan_str):
    vlans = set()
    if not vlan_str or vlan_str.strip().lower() in ('none', 'all'):
        return vlans
    parts = vlan_str.split(',')
    for part in parts:
        part = part.strip()
        if '-' in part:
            try:
                start, end = part.split('-')
                vlans.update(range(int(start), int(end) + 1))
            except ValueError:
                pass
        else:
            try:
                vlans.add(int(part))
            except ValueError:
                pass
    return vlans

# Helper function to convert IP and wildcard mask to CIDR
def wildcard_to_cidr(ip_str, wildcard_str):
    if ip_str.lower() == 'any' or wildcard_str.lower() == 'any':
        return 'any'
    if wildcard_str.lower() == 'host' or not wildcard_str:
        return f"{ip_str}/32"
    try:
        parts = wildcard_str.split('.')
        wildcard_bits = sum(bin(int(x)).count('1') for x in parts)
        cidr = 32 - wildcard_bits
        return f"{ip_str}/{cidr}"
    except (ValueError, IndexError):
        return f"{ip_str}/32"

class StandaloneParser:
    def __init__(self):
        self.devices = {}

    def parse_file(self, file_path):
        if not os.path.exists(file_path):
            print(f"Error: Log file not found at {file_path}", file=sys.stderr)
            sys.exit(1)
        with open(file_path, 'r') as f:
            content = f.read()

        prompt_regex = re.compile(r'^([A-Za-z0-9_\-]+)(?:#|>)\s*(show\s+[a-z0-9_\-\s|]+)$', re.IGNORECASE)
        current_device = None
        current_command = None
        command_lines = []

        for line in content.splitlines():
            line_stripped = line.strip()
            match = prompt_regex.match(line_stripped)
            if match:
                if current_device and current_command:
                    self._store_command_output(current_device, current_command, command_lines)
                current_device = match.group(1).strip()
                current_command = match.group(2).strip().lower()
                current_command = re.sub(r'\s+', ' ', current_command)
                command_lines = []
            else:
                if current_device and current_command:
                    command_lines.append(line)

        if current_device and current_command:
            self._store_command_output(current_device, current_command, command_lines)

        return self.devices

    def _store_command_output(self, device, command, lines):
        if device not in self.devices:
            self.devices[device] = {
                "ip_interfaces": {},
                "trunks": {},
                "vlans": {},
                "access_lists": {},
                "dhcp_pools": {},
                "nat": {"inside": set(), "outside": set(), "overload": False, "rules": []}
            }
        
        if "ip int" in command or "ip interface brief" in command:
            self._parse_ip_interface_brief(device, lines)
        elif "trunk" in command:
            self._parse_interfaces_trunk(device, lines)
        elif "vlan brief" in command or "vlan" in command:
            self._parse_vlan_brief(device, lines)
        elif "access-list" in command:
            self._parse_access_lists(device, lines)
        elif "dhcp pool" in command:
            self._parse_dhcp_pool(device, lines)
        elif "nat statistics" in command or "nat stat" in command:
            self._parse_nat_statistics(device, lines)

    def _parse_ip_interface_brief(self, device, lines):
        for line in lines:
            parts = line.split()
            if not parts or parts[0].lower() == 'interface' or parts[0].startswith('---'):
                continue
            if len(parts) >= 2:
                iface_name = parts[0]
                ip_addr = parts[1]
                status = parts[4] if len(parts) >= 5 else "unknown"
                protocol = parts[5] if len(parts) >= 6 else "unknown"
                if ip_addr.lower() != 'unassigned':
                    self.devices[device]["ip_interfaces"][iface_name] = {
                        "ip_address": ip_addr,
                        "status": status,
                        "protocol": protocol
                    }

    def _parse_interfaces_trunk(self, device, lines):
        allowed_vlan_section = False
        for line in lines:
            if "vlans allowed on trunk" in line.lower():
                allowed_vlan_section = True
                continue
            elif "vlans allowed and active" in line.lower():
                allowed_vlan_section = False
                continue
            elif not line.strip():
                continue
            
            if allowed_vlan_section:
                parts = line.split()
                if not parts or parts[0].lower() == 'port' or parts[0].startswith('---'):
                    continue
                if len(parts) >= 2:
                    port = parts[0]
                    vlan_str = parts[1]
                    vlans = parse_vlan_ranges(vlan_str)
                    if port not in self.devices[device]["trunks"]:
                        self.devices[device]["trunks"][port] = {"allowed_vlans": set()}
                    self.devices[device]["trunks"][port]["allowed_vlans"].update(vlans)

    def _parse_vlan_brief(self, device, lines):
        for line in lines:
            if not line.strip() or line.strip().startswith('VLAN') or line.strip().startswith('---'):
                continue
            parts = line.split()
            if len(parts) >= 3:
                try:
                    vlan_id = int(parts[0])
                    vlan_name = parts[1]
                    status = parts[2]
                    self.devices[device]["vlans"][vlan_id] = {
                        "name": vlan_name,
                        "status": status
                    }
                except ValueError:
                    continue

    def _parse_access_lists(self, device, lines):
        current_acl = None
        current_acl_type = None
        acl_header_regex = re.compile(r'^(Standard|Extended)\s+IP\s+access\s+list\s+([A-Za-z0-9_\-]+)', re.IGNORECASE)
        extended_rule_regex = re.compile(
            r'^\s*(\d+)?\s*(permit|deny)\s+([a-z0-9]+)\s+'
            r'(?:(host)\s+)?([0-9\.]+)(?:\s+([0-9\.]+))?\s+'
            r'(?:(host)\s+)?([0-9\.]+)(?:\s+([0-9\.]+))?'
            r'(?:\s+eq\s+([a-z0-9\-]+))?', re.IGNORECASE
        )
        standard_rule_regex = re.compile(
            r'^\s*(\d+)?\s*(permit|deny)\s+'
            r'(?:(host)\s+)?([0-9\.]+|any)(?:\s+([0-9\.]+))?', re.IGNORECASE
        )

        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                continue
            header_match = acl_header_regex.match(line_stripped)
            if header_match:
                current_acl_type = header_match.group(1).lower()
                current_acl = header_match.group(2)
                self.devices[device]["access_lists"][current_acl] = {
                    "type": current_acl_type,
                    "rules": []
                }
                continue

            if current_acl:
                if current_acl_type == "extended":
                    match = extended_rule_regex.match(line_stripped)
                    if match:
                        action = match.group(2).lower()
                        protocol = match.group(3).lower()
                        src_host = match.group(4)
                        src_ip = match.group(5)
                        src_wildcard = match.group(6) or ("0.0.0.0" if src_host else "0.0.0.0" if src_ip == "any" else None)
                        dest_host = match.group(7)
                        dest_ip = match.group(8)
                        dest_wildcard = match.group(9) or ("0.0.0.0" if dest_host else "0.0.0.0" if dest_ip == "any" else None)
                        port_str = match.group(10)
                        
                        port = None
                        if port_str:
                            port_str = port_str.lower()
                            if port_str in ('domain', 'dns'):
                                port = 53
                            elif port_str == 'ssh':
                                port = 22
                            else:
                                try:
                                    port = int(port_str)
                                except ValueError:
                                    port = port_str
                        
                        src_cidr = wildcard_to_cidr(src_ip, src_wildcard) if src_wildcard else src_ip
                        dest_cidr = wildcard_to_cidr(dest_ip, dest_wildcard) if dest_wildcard else dest_ip
                        self.devices[device]["access_lists"][current_acl]["rules"].append({
                            "action": action,
                            "protocol": protocol,
                            "source": src_cidr,
                            "destination": dest_cidr,
                            "destination_port": port
                        })
                    else:
                        if "permit ip any any" in line_stripped.lower():
                            self.devices[device]["access_lists"][current_acl]["rules"].append({
                                "action": "permit", "protocol": "ip", "source": "any", "destination": "any", "destination_port": None
                            })
                        elif "deny ip any any" in line_stripped.lower():
                            self.devices[device]["access_lists"][current_acl]["rules"].append({
                                "action": "deny", "protocol": "ip", "source": "any", "destination": "any", "destination_port": None
                            })
                elif current_acl_type == "standard":
                    match = standard_rule_regex.match(line_stripped)
                    if match:
                        action = match.group(2).lower()
                        src_host = match.group(3)
                        src_ip = match.group(4)
                        src_wildcard = match.group(5) or ("0.0.0.0" if src_host else "0.0.0.0" if src_ip == "any" else None)
                        src_cidr = wildcard_to_cidr(src_ip, src_wildcard) if src_wildcard else src_ip
                        self.devices[device]["access_lists"][current_acl]["rules"].append({
                            "action": action, "source": src_cidr, "protocol": "ip", "destination": "any", "destination_port": None
                        })

    def _parse_dhcp_pool(self, device, lines):
        current_pool = None
        pool_header_regex = re.compile(r'^Pool\s+([A-Za-z0-9_\-]+)\s*:', re.IGNORECASE)
        range_regex = re.compile(r'^\s*([0-9\.]+)\s+([0-9\.]+)\s+-\s+([0-9\.]+)\s+\d+', re.IGNORECASE)

        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                continue
            header_match = pool_header_regex.match(line_stripped)
            if header_match:
                current_pool = header_match.group(1)
                self.devices[device]["dhcp_pools"][current_pool] = {}
                continue
            if current_pool:
                match = range_regex.match(line_stripped)
                if match:
                    start_ip = match.group(2)
                    end_ip = match.group(3)
                    self.devices[device]["dhcp_pools"][current_pool] = {
                        "start": start_ip,
                        "end": end_ip
                    }

    def _parse_nat_statistics(self, device, lines):
        inside_section = False
        outside_section = False
        for line in lines:
            line_stripped = line.strip()
            if not line_stripped:
                continue
            
            if "inside interfaces:" in line_stripped.lower() or "inside source" in line_stripped.lower():
                inside_section = True
                outside_section = False
                # If there are interfaces on the same line, parse them
                if ":" in line_stripped:
                    ifaces = line_stripped.split(":")[-1].split(",")
                    for iface in ifaces:
                        if iface.strip():
                            self.devices[device]["nat"]["inside"].add(iface.strip())
                continue
            elif "outside interfaces:" in line_stripped.lower():
                outside_section = True
                inside_section = False
                if ":" in line_stripped:
                    ifaces = line_stripped.split(":")[-1].split(",")
                    for iface in ifaces:
                        if iface.strip():
                            self.devices[device]["nat"]["outside"].add(iface.strip())
                continue
            
            if inside_section and not line_stripped.startswith("Hits:") and not line_stripped.startswith("Expired:"):
                # Parse additional lines of interfaces if any
                parts = line_stripped.split(",")
                for p in parts:
                    if p.strip() and not p.strip().startswith("[") and not p.strip().startswith("Dynamic"):
                        self.devices[device]["nat"]["inside"].add(p.strip())

            if outside_section and not line_stripped.startswith("Hits:") and not line_stripped.startswith("Expired:"):
                # Parse additional lines of interfaces if any
                parts = line_stripped.split(",")
                for p in parts:
                    if p.strip() and not p.strip().startswith("[") and not p.strip().startswith("Dynamic"):
                        self.devices[device]["nat"]["outside"].add(p.strip())
            
            if "overload" in line_stripped.lower():
                self.devices[device]["nat"]["overload"] = True
                self.devices[device]["nat"]["rules"].append(line_stripped)


class StandaloneValidator:
    def __init__(self, site_config, parsed_data):
        self.site_config = site_config
        self.parsed_data = parsed_data
        self.findings = []

    def run_all_checks(self):
        self.check_vlan_existence()
        self.check_gateways()
        self.check_dhcp_pools()
        self.check_trunks()
        self.check_acl_isolation()
        self.check_ssh_restrictions()
        self.check_nat()
        return self.findings

    def check_vlan_existence(self):
        plan_vlans = {vlan["id"]: vlan["name"] for vlan in self.site_config.get("vlans", [])}
        for sw in ["SW1", "SW2"]:
            sw_data = self.parsed_data.get(sw, {})
            vlans = sw_data.get("vlans", {})
            for vid, name in plan_vlans.items():
                # Server is not assigned to ports on SW2 in design document, but should exist in VLAN database
                # SW2 should have Employee (10) and Guest (20) at minimum
                if vid not in vlans:
                    # Let's see: in validator, missing VLAN 20 is a fault
                    self.findings.append({
                        "summary": f"VLAN {vid} ({name}) Missing from Switch {sw} Database",
                        "symptom": f"Endpoints on VLAN {vid} cannot communicate because the VLAN does not exist in the switch database.",
                        "fix": f"SW2(config)# vlan {vid}\nSW2(config-vlan)# name {name}"
                    })

    def check_gateways(self):
        plan_vlans = self.site_config.get("vlans", [])
        r1 = self.parsed_data.get("R1", {})
        ip_interfaces = r1.get("ip_interfaces", {})

        for vlan in plan_vlans:
            subif = f"GigabitEthernet0/1.{vlan['id']}"
            if subif in ip_interfaces:
                cfg_ip = ip_interfaces[subif]["ip_address"].split('/')[0]
                if cfg_ip != vlan["gateway"]:
                    self.findings.append({
                        "summary": f"Wrong Default Gateway IP on R1 Sub-Interface {subif}",
                        "symptom": f"Endpoints on VLAN {vlan['id']} cannot reach default gateway {vlan['gateway']} (found {cfg_ip}), preventing access to other subnets or Internet.",
                        "fix": f"R1(config)# interface {subif}\nR1(config-subif)# ip address {vlan['gateway']} 255.255.255.0",
                        "evidence": f"Sub-interface {subif} configured with {cfg_ip} instead of {vlan['gateway']}"
                    })
            else:
                self.findings.append({
                    "summary": f"Missing Gateway Sub-Interface {subif} on R1",
                    "symptom": f"Endpoints on VLAN {vlan['id']} cannot routing traffic out of their subnet.",
                    "fix": f"R1(config)# interface {subif}\nR1(config-subif)# encapsulation dot1Q {vlan['id']}\nR1(config-subif)# ip address {vlan['gateway']} 255.255.255.0"
                })

    def check_dhcp_pools(self):
        r1 = self.parsed_data.get("R1", {})
        pools = r1.get("dhcp_pools", {})
        plan_vlans = self.site_config.get("vlans", [])

        for vlan in plan_vlans:
            # Check if DHCP is planned
            if vlan["id"] == 30: # Server VLAN has static IPs in plan
                continue
            
            # Find pool matching name
            pool_name = next((name for name in pools if vlan["name"].lower() in name.lower()), None)
            if not pool_name:
                self.findings.append({
                    "summary": f"DHCP Pool for VLAN {vlan['id']} ({vlan['name']}) is Missing",
                    "symptom": f"Clients on VLAN {vlan['id']} do not receive IP addresses automatically and remain disconnected.",
                    "fix": f"R1(config)# ip dhcp pool {vlan['name']}-Pool\nR1(config-dhcp)# network {vlan['gateway'].rsplit('.', 1)[0]}.0 255.255.255.0\nR1(config-dhcp)# default-router {vlan['gateway']}"
                })
                continue
            
            # Check if gateway IP is excluded. In R1 logs, if default gateway is leased inside range, it's a conflict
            pool_data = pools[pool_name]
            start_ip = pool_data.get("start")
            end_ip = pool_data.get("end")
            
            if start_ip and end_ip:
                try:
                    g_last = int(vlan["gateway"].split('.')[-1])
                    s_last = int(start_ip.split('.')[-1])
                    e_last = int(end_ip.split('.')[-1])
                    if s_last <= g_last <= e_last:
                        self.findings.append({
                            "summary": f"DHCP Pool Scope Conflict for Gateway IP on R1 Pool {pool_name}",
                            "symptom": f"IP Address conflict occurs on VLAN {vlan['id']} as R1 leases its own sub-interface address {vlan['gateway']} to clients.",
                            "fix": f"R1(config)# ip dhcp excluded-address {vlan['gateway']}",
                            "evidence": f"DHCP lease range starts from {start_ip} which includes gateway IP {vlan['gateway']}."
                        })
                except ValueError:
                    pass

    def check_trunks(self):
        plan_vlans = {vlan["id"] for vlan in self.site_config.get("vlans", [])}
        for sw in ["SW1", "SW2"]:
            sw_data = self.parsed_data.get(sw, {})
            trunks = sw_data.get("trunks", {})
            for port, trunk_data in trunks.items():
                allowed = trunk_data.get("allowed_vlans", set())
                missing = plan_vlans - allowed
                # Focus on critical VLANs that must traverse trunks. For SW2, allowed trunks must have VLAN 10 and 20.
                # If VLAN 20 is missing on SW2 trunk Gi0/2, it's a major issue.
                if missing:
                    missing_str = ",".join(str(v) for v in sorted(missing))
                    self.findings.append({
                        "summary": f"Trunk VLAN {missing_str} Missing on Switch {sw} Port {port}",
                        "symptom": f"Workstations on VLANs {missing_str} cannot traverse switch trunk links, causing complete loss of inter-switch connectivity.",
                        "fix": f"{sw}(config)# interface {port}\n{sw}(config-if)# switchport trunk allowed vlan add {missing_str}",
                        "evidence": f"Allowed VLANs on {port} do not contain VLAN(s) {missing_str}."
                    })

    def check_acl_isolation(self):
        r1 = self.parsed_data.get("R1", {})
        acls = r1.get("access_lists", {})
        guest_acl = acls.get("GUEST_IN", {})

        if not guest_acl:
            self.findings.append({
                "summary": "Missing Guest Isolation ACL (GUEST_IN) on Router R1",
                "symptom": "Lobby guests on VLAN 20 can freely access the Server VLAN 30 and Management SVI VLAN 99, violating isolation policies.",
                "fix": "R1(config)# ip access-list extended GUEST_IN\nR1(config-ext-nacl)# permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53\nR1(config-ext-nacl)# deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255\nR1(config-ext-nacl)# deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255\nR1(config-ext-nacl)# permit ip any any"
            })
            return

        rules = guest_acl.get("rules", [])
        
        # Check rule order for DNS vs Deny Server
        dns_permitted = False
        deny_server_occurred = False
        isolated_server = False
        isolated_management = False
        permit_all_before_deny = False

        for rule in rules:
            action = rule.get("action")
            protocol = rule.get("protocol")
            src = rule.get("source")
            dest = rule.get("destination")
            port = rule.get("destination_port")

            if action == "permit" and protocol == "ip" and src == "any" and dest == "any":
                permit_all_before_deny = True

            if action == "permit" and protocol == "udp":
                dest_ip = dest.split("/")[0] if dest else ""
                if (dest_ip == "10.10.30.10" or dest_ip == "10.10.30.0" or dest == "any") and port == 53:
                    if not deny_server_occurred:
                        dns_permitted = True

            if action == "deny" and protocol == "ip":
                src_match = (src == "10.10.20.0/24" or src == "any")
                dest_server_match = (dest == "10.10.30.0/24" or dest == "any" or (dest and dest.split("/")[0] == "10.10.30.10"))
                dest_mgt_match = (dest == "10.10.99.0/24" or dest == "any")

                if src_match and dest_server_match:
                    if not permit_all_before_deny:
                        isolated_server = True
                        deny_server_occurred = True

                if src_match and dest_mgt_match:
                    if not permit_all_before_deny:
                        isolated_management = True

        if not isolated_server:
            self.findings.append({
                "summary": "Guest-to-Server Isolation Policy Leak on R1",
                "symptom": "Lobby guests are able to access secure bank databases on SRV1 (10.10.30.10) due to missing deny rule or permit all override.",
                "fix": "R1(config)# ip access-list extended GUEST_IN\nR1(config-ext-nacl)# deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255"
            })
        elif deny_server_occurred and not dns_permitted:
            self.findings.append({
                "summary": "Guest-to-Server ACL Blocking DNS Queries on R1",
                "symptom": "Guest clients can ping external public IP addresses directly, but cannot load web pages because DNS queries to 10.10.30.10 are dropped.",
                "fix": "R1(config)# ip access-list extended GUEST_IN\nR1(config-ext-nacl)# permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53\n(Ensure this is sequenced before the deny rule)",
                "evidence": "Deny rule for 10.10.30.0/24 appears before permit DNS rule."
            })

        if not isolated_management:
            self.findings.append({
                "summary": "Guest-to-Management Network Security Leak on R1",
                "symptom": "Lobby guests on VLAN 20 can access management systems on VLAN 99, violating security rules.",
                "fix": "R1(config)# ip access-list extended GUEST_IN\nR1(config-ext-nacl)# deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255"
            })

    def check_ssh_restrictions(self):
        for dev_name in ["R1", "SW1", "SW2"]:
            dev_data = self.parsed_data.get(dev_name, {})
            acls = dev_data.get("access_lists", {})
            
            # Look for line vty ssh ACL (typically Standard ACL 99)
            ssh_acl = acls.get("99") or acls.get("SSH_ONLY")
            
            if not ssh_acl:
                self.findings.append({
                    "summary": f"Unsecured SSH Shell Terminal Access on {dev_name}",
                    "symptom": f"Anyone connected to the internal subnets (including guests or teller machines) can attempt to SSH to the switch/router CLI.",
                    "fix": f"{dev_name}(config)# access-list 99 permit 10.10.99.0 0.0.0.255\n{dev_name}(config)# line vty 0 15\n{dev_name}(config-line)# access-class 99 in"
                })
                continue

            rules = ssh_acl.get("rules", [])
            has_mgt_permit = False
            has_broad_permit = False
            unauthorized_sources = []

            for rule in rules:
                action = rule.get("action")
                src = rule.get("source")
                if action == "permit":
                    if src == "any":
                        has_broad_permit = True
                    elif src == "10.10.99.0/24":
                        has_mgt_permit = True
                    else:
                        unauthorized_sources.append(src)

            if has_broad_permit or unauthorized_sources:
                unauth_str = ", ".join(unauthorized_sources) if unauthorized_sources else "all networks"
                self.findings.append({
                    "summary": f"Insecure SSH VTY Access-Class List on {dev_name}",
                    "symptom": f"VTY lines permit SSH traffic from unauthorized subnets ({unauth_str}). SSH must be restricted to management subnet 10.10.99.0/24.",
                    "fix": f"{dev_name}(config)# no access-list 99\n{dev_name}(config)# access-list 99 permit 10.10.99.0 0.0.0.255",
                    "evidence": f"Permit rules exist for sources other than 10.10.99.0/24."
                })

    def check_nat(self):
        r1 = self.parsed_data.get("R1", {})
        nat_data = r1.get("nat", {})
        
        # Check if outside interface is set
        outside = nat_data.get("outside", set())
        # Gig0/0 is expected WAN outside
        if not outside or "GigabitEthernet0/0" not in outside:
            self.findings.append({
                "summary": "NAT Outside Interface Not Configured on Router R1 WAN",
                "symptom": "Internal clients cannot access the internet because the router does not map translated packets to the WAN interface.",
                "fix": "R1(config)# interface GigabitEthernet0/0\nR1(config-if)# ip nat outside",
                "evidence": "GigabitEthernet0/0 is not configured as outside interface in NAT statistics."
            })
            
        # Check if inside interfaces are set
        inside = nat_data.get("inside", set())
        plan_inside_interfaces = {"GigabitEthernet0/1.10", "GigabitEthernet0/1.20", "GigabitEthernet0/1.30", "GigabitEthernet0/1.99"}
        missing_inside = plan_inside_interfaces - inside
        if missing_inside:
            m_str = ", ".join(missing_inside)
            self.findings.append({
                "summary": f"NAT Inside Interface Missing on R1 for: {m_str}",
                "symptom": f"Internal users in {m_str} cannot access the internet (no NAT translation is triggered).",
                "fix": "\n".join(f"R1(config)# interface {iface}\nR1(config-subif)# ip nat inside" for iface in missing_inside),
                "evidence": f"NAT inside interfaces list is missing {m_str}."
            })
            
        # Check for NAT overload mapping rule
        if not nat_data.get("overload", False):
            self.findings.append({
                "summary": "NAT Source Overload Mapping (PAT) is Missing on R1",
                "symptom": "Internal endpoints can ping R1's gateway but cannot browse the internet since their private IPs are not translated to the WAN public IP.",
                "fix": "R1(config)# ip access-list standard NAT_ACL\nR1(config-std-nacl)# permit 10.10.10.0 0.0.0.255\nR1(config-std-nacl)# permit 10.10.20.0 0.0.0.255\nR1(config-std-nacl)# permit 10.10.99.0 0.0.0.255\nR1(config)# ip nat inside source list NAT_ACL interface GigabitEthernet0/0 overload",
                "evidence": "No dynamic source overload mappings found matching interface GigabitEthernet0/0."
            })


def main():
    parser = argparse.ArgumentParser(description="SmartBranch 360 Static Config Assurance Tool")
    parser.add_argument("--config", required=True, help="Path to standard Cisco CLI dump text file")
    parser.add_argument("--plan", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "smartbranch360.yaml"), help="Path to smartbranch360.yaml design plan")
    args = parser.parse_args()

    # Load design plan
    if not os.path.exists(args.plan):
        # Fallback to search in current working directory
        local_plan = "smartbranch360.yaml"
        if os.path.exists(local_plan):
            args.plan = local_plan
        else:
            print(f"Error: Design plan file {args.plan} not found.", file=sys.stderr)
            sys.exit(1)

    try:
        with open(args.plan, 'r') as f:
            site_config = yaml.safe_load(f)
    except Exception as e:
        print(f"Error reading YAML design plan: {e}", file=sys.stderr)
        sys.exit(1)

    # Parse logs
    log_parser = StandaloneParser()
    parsed_data = log_parser.parse_file(args.config)

    # Validate
    validator = StandaloneValidator(site_config, parsed_data)
    findings = validator.run_all_checks()

    print("=" * 60)
    print(" SmartBranch 360 Automated Network Configuration Audit")
    print(f" Target Config: {os.path.basename(args.config)}")
    print(f" Design Plan:   {os.path.basename(args.plan)}")
    print("=" * 60)

    # Print summary
    if not findings:
        print("\n[\033[32mPASS\033[0m] Validation Successful: 0 findings.")
        print("All device interfaces, VLAN databases, trunk links, DHCP ranges, inside/outside NAT configurations, and access security rules comply with banking policy.")
    else:
        print(f"\n[\033[31mFAIL\033[0m] Validation Audit Failed: {len(findings)} issues found.")
        print("-" * 60)
        for idx, f in enumerate(findings, 1):
            print(f"{idx}. \033[1;31m{f['summary']}\033[0m")
            print(f"   Symptom:      {f['symptom']}")
            if 'evidence' in f:
                print(f"   Evidence:     {f['evidence']}")
            fix_indented = f['fix'].replace('\n', '\n                 ')
            print(f"   Suggested Fix:\033[32m {fix_indented}\033[0m")
            print("-" * 60)
            
    sys.exit(len(findings))

if __name__ == "__main__":
    main()
