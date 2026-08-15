import re

def parse_vlan_ranges(vlan_str):
    """
    Expands a VLAN list/range string (e.g. '10,20,30-33,99') into a set of integers.
    """
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

def wildcard_to_cidr(ip_str, wildcard_str):
    """
    Converts an IP and wildcard mask (inverse mask) pair (e.g. '10.10.10.0', '0.0.0.255')
    into a CIDR string (e.g. '10.10.10.0/24').
    If the wildcard is 'any', returns 'any'.
    """
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

class CommandParser:
    def __init__(self):
        self.devices = {}

    def parse_file(self, file_path):
        """
        Reads a log file and splits content by device prompts.
        Matches prompts like:
          R1# show ip interface brief
          SW1# show interfaces trunk
        """
        with open(file_path, 'r') as f:
            content = f.read()

        # Regular expression to match device prompts and commands
        # Example: "R1# show ip interface brief" or "SW2>show vlan brief"
        prompt_regex = re.compile(r'^([A-Za-z0-9_\-]+)(?:#|>)\s*(show\s+[a-z0-9_\-\s|]+)$', re.IGNORECASE)

        current_device = None
        current_command = None
        command_lines = []

        lines = content.splitlines()
        for line in lines:
            line_stripped = line.strip()
            match = prompt_regex.match(line_stripped)
            if match:
                # Save previous command output
                if current_device and current_command:
                    self._store_command_output(current_device, current_command, command_lines)
                
                current_device = match.group(1).strip()
                current_command = match.group(2).strip().lower()
                # Normalize command spaces
                current_command = re.sub(r'\s+', ' ', current_command)
                command_lines = []
            else:
                if current_device and current_command:
                    command_lines.append(line)

        # Store last command
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
                "dhcp_pools": {}
            }
        
        # Standardize command aliases
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
            r'^\s*(\d+)?\s*(permit|deny)\s+([a-z0-9]+)\s+'  # seq, action, protocol
            r'(?:(host)\s+)?([0-9\.]+)(?:\s+([0-9\.]+))?\s+'  # source ip + wildcard
            r'(?:(host)\s+)?([0-9\.]+)(?:\s+([0-9\.]+))?'  # dest ip + wildcard
            r'(?:\s+eq\s+([a-z0-9\-]+))?', re.IGNORECASE  # optional port eq
        )

        standard_rule_regex = re.compile(
            r'^\s*(\d+)?\s*(permit|deny)\s+'  # seq, action
            r'(?:(host)\s+)?([0-9\.]+|any)(?:\s+([0-9\.]+))?', re.IGNORECASE  # source + wildcard
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
                        seq = match.group(1)
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
                            if port_str == 'domain' or port_str == 'dns':
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
                                "action": "permit",
                                "protocol": "ip",
                                "source": "any",
                                "destination": "any",
                                "destination_port": None
                            })
                        elif "deny ip any any" in line_stripped.lower():
                            self.devices[device]["access_lists"][current_acl]["rules"].append({
                                "action": "deny",
                                "protocol": "ip",
                                "source": "any",
                                "destination": "any",
                                "destination_port": None
                            })

                elif current_acl_type == "standard":
                    match = standard_rule_regex.match(line_stripped)
                    if match:
                        seq = match.group(1)
                        action = match.group(2).lower()
                        src_host = match.group(3)
                        src_ip = match.group(4)
                        src_wildcard = match.group(5) or ("0.0.0.0" if src_host else "0.0.0.0" if src_ip == "any" else None)
                        
                        src_cidr = wildcard_to_cidr(src_ip, src_wildcard) if src_wildcard else src_ip
                        
                        self.devices[device]["access_lists"][current_acl]["rules"].append({
                            "action": action,
                            "source": src_cidr,
                            "protocol": "ip",
                            "destination": "any",
                            "destination_port": None
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
                    current_idx = match.group(1)
                    start_ip = match.group(2)
                    end_ip = match.group(3)
                    self.devices[device]["dhcp_pools"][current_pool] = {
                        "start": start_ip,
                        "end": end_ip
                    }
