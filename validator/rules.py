class RuleEngine:
    def __init__(self, site_config, parsed_data):
        self.site_config = site_config
        self.parsed_data = parsed_data
        self.findings = []

    def run_all_checks(self):
        self.check_wrong_gateways()
        self.check_missing_vlans_on_trunks()
        self.check_dhcp_scope_conflicts()
        self.check_guest_server_leak()
        self.check_acl_blocking_dns()
        self.check_ssh_access_restrictions()
        return self.findings

    def check_wrong_gateways(self):
        """
        Cross-checks sub-interface IP addresses on R1 and SVI IPs on switches
        against planned gateways and SVIs.
        """
        # 1. Check Router R1 Gateway IPs
        vlans = self.site_config.get("vlans", [])
        devices = self.parsed_data.get("R1", {})
        ip_interfaces = devices.get("ip_interfaces", {})

        for vlan in vlans:
            vlan_id = vlan.get("id")
            planned_gateway = vlan.get("gateway")
            
            # Find subinterface for this VLAN
            subif_name = f"GigabitEthernet0/1.{vlan_id}"
            
            if subif_name in ip_interfaces:
                cfg_ip = ip_interfaces[subif_name]["ip_address"]
                cfg_ip_clean = cfg_ip.split('/')[0]
                if cfg_ip_clean != planned_gateway:
                    self.findings.append({
                        "summary": f"Wrong Gateway IP Configured on Router R1 sub-interface {subif_name}",
                        "symptom": f"Endpoints in VLAN {vlan_id} ({vlan.get('name')}) cannot ping their default gateway {planned_gateway} and cannot access other subnets or the internet.",
                        "fix": f"Configure the correct IP address {planned_gateway} on Router R1 sub-interface {subif_name} using:\ninterface {subif_name}\n ip address {planned_gateway} 255.255.255.0"
                    })
            else:
                self.findings.append({
                    "summary": f"Missing Gateway sub-interface {subif_name} on Router R1",
                    "symptom": f"Endpoints in VLAN {vlan_id} ({vlan.get('name')}) have no default gateway on the router, preventing all inter-VLAN and internet traffic.",
                    "fix": f"Create and configure the sub-interface using:\ninterface {subif_name}\n encapsulation dot1Q {vlan_id}\n ip address {planned_gateway} 255.255.255.0"
                })

        # 2. Check Switch SVIs (Vlan99 Management SVI)
        switches_cfg = self.site_config.get("devices", {}).get("switches", [])
        for sw in switches_cfg:
            sw_name = sw.get("name")
            planned_mgt_ip = sw.get("management_ip", "").split('/')[0]
            
            sw_parsed = self.parsed_data.get(sw_name, {})
            sw_ips = sw_parsed.get("ip_interfaces", {})
            
            if "Vlan99" in sw_ips:
                cfg_ip = sw_ips["Vlan99"]["ip_address"].split('/')[0]
                if cfg_ip != planned_mgt_ip:
                    self.findings.append({
                        "summary": f"Wrong Management IP Configured on Switch {sw_name} SVI Vlan99",
                        "symptom": f"IT administrators cannot access Switch {sw_name} via SSH for management because its SVI IP ({cfg_ip}) does not match the management plan.",
                        "fix": f"Configure the correct management IP on Switch {sw_name} using:\ninterface Vlan99\n ip address {planned_mgt_ip} 255.255.255.0"
                    })
            else:
                self.findings.append({
                    "summary": f"Missing SVI Vlan99 on Switch {sw_name}",
                    "symptom": f"IT administrators cannot manage Switch {sw_name} remotely over the network.",
                    "fix": f"Configure SVI Vlan99 on Switch {sw_name} using:\ninterface Vlan99\n ip address {planned_mgt_ip} 255.255.255.0\n no shutdown"
                })

    def check_missing_vlans_on_trunks(self):
        """
        Cross-checks switches' trunk interfaces to ensure all planned VLANs (10, 20, 30, 99) are allowed.
        """
        switches_cfg = self.site_config.get("devices", {}).get("switches", [])
        planned_vlans = {vlan["id"] for vlan in self.site_config.get("vlans", [])}

        for sw in switches_cfg:
            sw_name = sw.get("name")
            sw_parsed = self.parsed_data.get(sw_name, {})
            trunks = sw_parsed.get("trunks", {})

            for trunk_name, trunk_data in trunks.items():
                allowed = trunk_data.get("allowed_vlans", set())
                missing = planned_vlans - allowed
                if missing:
                    missing_str = ",".join(str(v) for v in sorted(missing))
                    self.findings.append({
                        "summary": f"VLAN {missing_str} Missing from Switch {sw_name} Trunk Interface {trunk_name}",
                        "symptom": f"Clients in VLAN(s) {missing_str} connected to Switch {sw_name} cannot communicate across the network because their VLAN traffic is blocked on the trunk link.",
                        "fix": f"Configure the trunk on Switch {sw_name} {trunk_name} to allow all required VLANs using:\ninterface {trunk_name}\n switchport trunk allowed vlan add {missing_str}"
                    })

    def check_dhcp_scope_conflicts(self):
        """
        Verifies that DHCP ranges on Router R1 do not overlap with gateway IPs,
        or are configured with incorrect start/end boundaries.
        """
        vlans = self.site_config.get("vlans", [])
        r1_parsed = self.parsed_data.get("R1", {})
        dhcp_pools = r1_parsed.get("dhcp_pools", {})

        for vlan in vlans:
            vlan_id = vlan.get("id")
            vlan_name = vlan.get("name")
            gateway = vlan.get("gateway")
            dhcp_cfg = vlan.get("dhcp_range")

            if not dhcp_cfg:
                continue

            planned_start = dhcp_cfg.get("start")
            planned_end = dhcp_cfg.get("end")

            pool_name = next((name for name in dhcp_pools if vlan_name.lower() in name.lower()), None)
            
            if not pool_name:
                self.findings.append({
                    "summary": f"Missing DHCP Pool for {vlan_name} VLAN {vlan_id} on Router R1",
                    "symptom": f"Clients in VLAN {vlan_id} do not receive IP addresses automatically and experience a total lack of network access.",
                    "fix": f"Create the DHCP pool on Router R1 using:\nip dhcp pool {vlan_name}-Pool\n network {gateway.rsplit('.', 1)[0]}.0 255.255.255.0\n default-router {gateway}\n dns-server 10.10.30.10"
                })
                continue

            pool_data = dhcp_pools[pool_name]
            cfg_start = pool_data.get("start")
            cfg_end = pool_data.get("end")

            if not cfg_start or not cfg_end:
                continue

            try:
                gateway_last_octet = int(gateway.split('.')[-1])
                cfg_start_last_octet = int(cfg_start.split('.')[-1])
                cfg_end_last_octet = int(cfg_end.split('.')[-1])
                
                if cfg_start_last_octet <= gateway_last_octet <= cfg_end_last_octet:
                    self.findings.append({
                        "summary": f"DHCP Scope Conflict on Router R1 Pool {pool_name}",
                        "symptom": f"Duplicate IP addresses and intermittent network connectivity issues occur because the router leases its own gateway IP ({gateway}) to client workstations.",
                        "fix": f"Exclude the gateway IP address from the DHCP pool on Router R1 using:\nip dhcp excluded-address {gateway}"
                    })
                elif cfg_start != planned_start or cfg_end != planned_end:
                    self.findings.append({
                        "summary": f"Incorrect DHCP Range Configured on Router R1 Pool {pool_name}",
                        "symptom": f"Workstations in VLAN {vlan_id} receive IP addresses outside the authorized subnet design, which could lead to IP depletion or routing problems.",
                        "fix": f"Correct the DHCP pool ranges and configure exclusions so that the active lease range is from {planned_start} to {planned_end}."
                    })
            except (ValueError, IndexError):
                pass

    def check_guest_server_leak(self):
        """
        Verifies that Guest VLAN 20 is isolated from Server VLAN 30.
        It checks if an ACL on R1 blocks traffic from 10.10.20.0/24 to 10.10.30.0/24.
        """
        r1_parsed = self.parsed_data.get("R1", {})
        access_lists = r1_parsed.get("access_lists", {})

        guest_acl = access_lists.get("GUEST_IN")

        if not guest_acl:
            self.findings.append({
                "summary": "Missing Guest Isolation ACL on Router R1",
                "symptom": "Guests on Guest Wi-Fi (VLAN 20) can freely access internal resources, including the Server VLAN 30, posing a severe security risk.",
                "fix": "Create and apply the GUEST_IN access-list on Router R1:\nip access-list extended GUEST_IN\n deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255\n permit ip any any\ninterface GigabitEthernet0/1.20\n ip access-group GUEST_IN in"
            })
            return

        rules = guest_acl.get("rules", [])
        isolated = False
        permit_all_before_deny = False

        for rule in rules:
            action = rule.get("action")
            src = rule.get("source")
            dest = rule.get("destination")
            protocol = rule.get("protocol")

            if action == "permit" and protocol == "ip" and src == "any" and dest == "any":
                permit_all_before_deny = True

            if action == "deny" and protocol == "ip":
                src_match = (src == "10.10.20.0/24" or src == "any")
                dest_match = (dest == "10.10.30.0/24" or dest == "any")
                
                if src_match and dest_match:
                    if not permit_all_before_deny:
                        isolated = True
                        break

        if permit_all_before_deny and not isolated:
            self.findings.append({
                "summary": "Ineffective Guest Isolation (Traffic Leak) due to Broad Permit Rule Placement",
                "symptom": "Guests on Guest Wi-Fi (VLAN 20) can access secure Server VLAN 30 because the 'permit ip any any' statement is evaluated before the isolation rule.",
                "fix": "Reorder the GUEST_IN ACL rules so that the 'deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255' rule is placed at the top of the access-list."
            })
        elif not isolated:
            self.findings.append({
                "summary": "Guest VLAN Traffic Leaking to Server VLAN on Router R1",
                "symptom": "Guests on Guest Wi-Fi (VLAN 20) can access secure bank servers and databases in VLAN 30, violating regulatory compliance policies.",
                "fix": "Add a deny rule to the GUEST_IN ACL on Router R1 to block Guest traffic to the Server subnet:\nip access-list extended GUEST_IN\n deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255"
            })

    def check_acl_blocking_dns(self):
        """
        Verifies that DNS queries (UDP port 53) from Guest VLAN 20 to the DNS Server 10.10.30.10
        are permitted before any deny rules block access to the Server subnet.
        """
        r1_parsed = self.parsed_data.get("R1", {})
        access_lists = r1_parsed.get("access_lists", {})
        guest_acl = access_lists.get("GUEST_IN")

        if not guest_acl:
            return

        rules = guest_acl.get("rules", [])
        dns_permitted = False
        deny_server_occurred = False

        for rule in rules:
            action = rule.get("action")
            src = rule.get("source")
            dest = rule.get("destination")
            protocol = rule.get("protocol")
            dest_port = rule.get("destination_port")

            if action == "permit" and protocol == "udp":
                dest_clean = dest.split('/')[0] if dest else ""
                dest_is_dns = (dest_clean == "10.10.30.10" or dest == "10.10.30.0/24" or dest == "any")
                port_is_dns = (dest_port == 53)
                
                if dest_is_dns and port_is_dns:
                    if not deny_server_occurred:
                        dns_permitted = True
                        break

            if action == "deny" and protocol == "ip":
                src_match = (src == "10.10.20.0/24" or src == "any")
                dest_match = (dest == "10.10.30.0/24" or dest == "any" or dest.split('/')[0] == "10.10.30.10")
                if src_match and dest_match:
                    deny_server_occurred = True

        if deny_server_occurred and not dns_permitted:
            self.findings.append({
                "summary": "Access Control List Blocking DNS Traffic on Router R1",
                "symptom": "Guest clients on VLAN 20 can ping external IP addresses (e.g. 8.8.8.8) but cannot resolve domain names, resulting in web pages failing to load.",
                "fix": "Reorder the GUEST_IN ACL rules so that the permit rule for DNS (UDP port 53) to host 10.10.30.10 is evaluated before the deny rule for the Server subnet:\nip access-list extended GUEST_IN\n permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53"
            })

    def check_ssh_access_restrictions(self):
        """
        Verifies that device management SSH access is permitted only from the Management VLAN (10.10.99.0/24).
        It checks access-list 99 (or SSH_ONLY) on R1, SW1, SW2.
        """
        for device_name in ["R1", "SW1", "SW2"]:
            device_parsed = self.parsed_data.get(device_name, {})
            access_lists = device_parsed.get("access_lists", {})

            mgt_acl = access_lists.get("99") or access_lists.get("SSH_ONLY")

            if not mgt_acl:
                self.findings.append({
                    "summary": f"Insecure SSH Configuration on Device {device_name}",
                    "symptom": f"Any endpoint on any subnet can attempt SSH connections to {device_name}, creating a brute-force security risk.",
                    "fix": f"Configure access-list 99 on {device_name} and apply it to the VTY lines:\naccess-list 99 permit 10.10.99.0 0.0.0.255\nline vty 0 15\n access-class 99 in"
                })
                continue

            rules = mgt_acl.get("rules", [])
            allowed_sources = set()
            broad_permit = False

            for rule in rules:
                action = rule.get("action")
                src = rule.get("source")

                if action == "permit":
                    if src == "any":
                        broad_permit = True
                    else:
                        allowed_sources.add(src)

            unauthorized_sources = []
            for src in allowed_sources:
                src_clean = src.split('/')[0]
                if src_clean != "10.10.99.0" and src != "any":
                    unauthorized_sources.append(src)

            if broad_permit:
                self.findings.append({
                    "summary": f"SSH Management Access Open to All Subnets on Device {device_name}",
                    "symptom": f"Workstations in Employee VLAN 10 or Guest VLAN 20 can reach the SSH CLI login page of {device_name}.",
                    "fix": f"Modify access-list 99 on {device_name} to restrict access to management subnet only:\nno access-list 99\naccess-list 99 permit 10.10.99.0 0.0.0.255"
                })
            elif unauthorized_sources:
                sources_str = ", ".join(unauthorized_sources)
                self.findings.append({
                    "summary": f"SSH Management Access Allowed from Non-Management Subnets on Device {device_name}",
                    "symptom": f"Workstations in unauthorized subnets ({sources_str}) are permitted to connect via SSH to {device_name}.",
                    "fix": f"Modify access-list 99 on {device_name} to permit only the management subnet 10.10.99.0/24:\nno access-list 99\naccess-list 99 permit 10.10.99.0 0.0.0.255"
                })
