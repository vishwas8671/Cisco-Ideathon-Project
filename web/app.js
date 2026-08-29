/* ==========================================================================
   SmartBranch 360 JavaScript Application
   ========================================================================== */

// --- Site Specification (Source of Truth) ---
const siteConfig = {
    site_name: "Meridian Trust Bank - Retail Branch",
    vlans: [
        { id: 10, name: "Employee", subnet: "10.10.10.0/24", gateway: "10.10.10.1", dhcp_range: { start: "10.10.10.10", end: "10.10.10.250" } },
        { id: 20, name: "Guest", subnet: "10.10.20.0/24", gateway: "10.10.20.1", dhcp_range: { start: "10.10.20.10", end: "10.10.20.250" } },
        { id: 30, name: "Server", subnet: "10.10.30.0/24", gateway: "10.10.30.1", dhcp_range: null },
        { id: 99, name: "Management", subnet: "10.10.99.0/24", gateway: "10.10.99.1", dhcp_range: { start: "10.10.99.10", end: "10.10.99.50" } }
    ],
    devices: {
        routers: [
            { name: "R1", model: "Cisco 2911" }
        ],
        switches: [
            { name: "SW1", model: "Cisco 2960", management_ip: "10.10.99.2/24" },
            { name: "SW2", model: "Cisco 2960", management_ip: "10.10.99.3/24" }
        ]
    }
};

// --- Embedded Cisco IOS Configuration References ---
const iosReferenceConfigs = {
    r1: `! ==========================================================
! CISCO IOS REFERENCE CONFIGURATION - ROUTER R1 (Cisco 2911)
! ==========================================================
enable
configure terminal

hostname R1
ip domain-name meridian-trust.local
enable secret cisco123
username admin privilege 15 secret admin123

crypto key generate rsa
1024
ip ssh version 2

! --- DHCP Configurations ---
ip dhcp excluded-address 10.10.10.1
ip dhcp excluded-address 10.10.20.1
ip dhcp excluded-address 10.10.30.1
ip dhcp excluded-address 10.10.99.1
ip dhcp excluded-address 10.10.30.2 10.10.30.254
ip dhcp excluded-address 10.10.99.2 10.10.99.9
ip dhcp excluded-address 10.10.99.51 10.10.99.254

ip dhcp pool Employee-Pool
 network 10.10.10.0 255.255.255.0
 default-router 10.10.10.1
 dns-server 10.10.30.10
 lease 1 0 0

ip dhcp pool Guest-Pool
 network 10.10.20.0 255.255.255.0
 default-router 10.10.20.1
 dns-server 10.10.30.10
 lease 0 4 0

ip dhcp pool Management-Pool
 network 10.10.99.0 255.255.255.0
 default-router 10.10.99.1
 dns-server 10.10.30.10
 lease 1 0 0

! --- Access Control Lists ---
! SEC-03: Permit DNS (UDP Port 53) to Server host before blocking Guest-to-Server range
ip access-list extended GUEST_IN
 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
 deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255
 permit ip any any

ip access-list standard NAT_ACL
 permit 10.10.10.0 0.0.0.255
 permit 10.10.20.0 0.0.0.255
 permit 10.10.99.0 0.0.0.255

! Restrict SSH logins on VTY lines to Management subnet only
access-list 99 permit 10.10.99.0 0.0.0.255
access-list 99 deny any

! --- Interfaces ---
! WAN outside NAT gateway (Lab Uplink)
interface GigabitEthernet0/0
 description WAN Uplink to ISP
 ip address 203.0.113.2 255.255.255.252
 ip nat outside
 no shutdown

! Router-on-a-Stick trunk subinterfaces setup
interface GigabitEthernet0/1
 description Trunk Link to SW1
 no ip address
 no shutdown

interface GigabitEthernet0/1.10
 encapsulation dot1Q 10
 ip address 10.10.10.1 255.255.255.0
 ip nat inside

interface GigabitEthernet0/1.20
 encapsulation dot1Q 20
 ip address 10.10.20.1 255.255.255.0
 ip access-group GUEST_IN in
 ip nat inside

interface GigabitEthernet0/1.30
 encapsulation dot1Q 30
 ip address 10.10.30.1 255.255.255.0
 ip nat inside

interface GigabitEthernet0/1.99
 encapsulation dot1Q 99
 ip address 10.10.99.1 255.255.255.0
 ip nat inside

! --- NAT PAT Configuration ---
ip nat inside source list NAT_ACL interface GigabitEthernet0/0 overload
ip route 0.0.0.0 0.0.0.0 203.0.113.1

line con 0
 login local
line vty 0 15
 access-class 99 in
 login local
 transport input ssh
end`,
    sw1: `! ==========================================================
! CISCO IOS REFERENCE CONFIGURATION - SWITCH SW1 (Cisco 2960)
! ==========================================================
enable
configure terminal

hostname SW1
ip domain-name meridian-trust.local
enable secret cisco123
username admin privilege 15 secret admin123

crypto key generate rsa
1024
ip ssh version 2

! --- VLAN Creation ---
vlan 10
 name Employee
vlan 20
 name Guest
vlan 30
 name Server
vlan 99
 name Management
exit

interface Vlan99
 description Management SVI
 ip address 10.10.99.2 255.255.255.0
 no shutdown

ip default-gateway 10.10.99.1

! --- Trunks ---
interface GigabitEthernet0/1
 description Trunk to Router R1
 switchport mode trunk
 switchport trunk allowed vlan 10,20,30,99
 no shutdown

interface GigabitEthernet0/2
 description Trunk to SW2
 switchport mode trunk
 switchport trunk allowed vlan 10,20,30,99
 no shutdown

! --- Access Ports ---
interface FastEthernet0/1
 description Employee-PC01
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/2
 description Employee-PC02
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/10
 description SRV-DNS-WEB (VLAN 30)
 switchport mode access
 switchport access vlan 30
 spanning-tree portfast

interface FastEthernet0/11
 description Management-PC01
 switchport mode access
 switchport access vlan 99
 spanning-tree portfast

access-list 99 permit 10.10.99.0 0.0.0.255
access-list 99 deny any

line vty 0 15
 access-class 99 in
 login local
 transport input ssh
end`,
    sw2: `! ==========================================================
! CISCO IOS REFERENCE CONFIGURATION - SWITCH SW2 (Cisco 2960)
! ==========================================================
enable
configure terminal

hostname SW2
ip domain-name meridian-trust.local
enable secret cisco123
username admin privilege 15 secret admin123

crypto key generate rsa
1024
ip ssh version 2

! --- VLAN Creation ---
vlan 10
 name Employee
vlan 20
 name Guest
vlan 30
 name Server
vlan 99
 name Management
exit

interface Vlan99
 description Management SVI
 ip address 10.10.99.3 255.255.255.0
 no shutdown

ip default-gateway 10.10.99.1

! --- Trunks ---
interface GigabitEthernet0/2
 description Trunk to SW1
 switchport mode trunk
 switchport trunk allowed vlan 10,20,30,99
 no shutdown

! --- Access Ports ---
interface FastEthernet0/1
 description Employee-PC03
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/2
 description Employee-PC04
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/20
 description AP-01
 switchport mode access
 switchport access vlan 20
 spanning-tree portfast

access-list 99 permit 10.10.99.0 0.0.0.255
access-list 99 deny any

line vty 0 15
 access-class 99 in
 login local
 transport input ssh
end`
};

// --- Predefined CLI Log Outputs ---
const sampleLogs = {
    clean: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES manual up                    up
GigabitEthernet0/1     unassigned      YES unset  up                    up
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    20 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    30 deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255
    40 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255
    20 deny any

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.10      - 10.10.10.250      0
Pool Guest-Pool :
 Current index        IP address range                    Leased address
 10.10.20.1           10.10.20.10      - 10.10.20.250      0
Pool Management-Pool :
 Current index        IP address range                    Leased address
 10.10.99.1           10.10.99.10      - 10.10.99.50       0

R1# show ip nat statistics
Total active translations: 2 (0 static, 2 dynamic; 2 extended)
Outside interfaces:
  GigabitEthernet0/0
Inside interfaces:
  GigabitEthernet0/1.10, GigabitEthernet0/1.20, GigabitEthernet0/1.30, GigabitEthernet0/1.99
Hits: 12  Misses: 2
Expired translations: 10
Dynamic mappings:
  [Id: 1] access-list NAT_ACL interface GigabitEthernet0/0 overload

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Fa0/3, Fa0/4, Fa0/5
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW1# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
1    default                          active    Fa0/4, Fa0/5
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20
30   Server                           active    
99   Management                       active    

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_wrong_gateway: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES manual up                    up
GigabitEthernet0/1.10  10.10.10.2      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    20 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    30 deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255
    40 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.10      - 10.10.10.250      0
Pool Guest-Pool :
 Current index        IP address range                    Leased address
 10.10.20.1           10.10.20.10      - 10.10.20.250      0
Pool Management-Pool :
 Current index        IP address range                    Leased address
 10.10.99.1           10.10.99.10      - 10.10.99.50       0

R1# show ip nat statistics
Total active translations: 2 (0 static, 2 dynamic; 2 extended)
Outside interfaces:
  GigabitEthernet0/0
Inside interfaces:
  GigabitEthernet0/1.10, GigabitEthernet0/1.20, GigabitEthernet0/1.30, GigabitEthernet0/1.99
Hits: 12  Misses: 2
Expired translations: 10
Dynamic mappings:
  [Id: 1] access-list NAT_ACL interface GigabitEthernet0/0 overload

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW1# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_missing_vlan_trunk: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES manual up                    up
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    20 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    30 deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255
    40 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.10      - 10.10.10.250      0
Pool Guest-Pool :
 Current index        IP address range                    Leased address
 10.10.20.1           10.10.20.10      - 10.10.20.250      0
Pool Management-Pool :
 Current index        IP address range                    Leased address
 10.10.99.1           10.10.99.10      - 10.10.99.50       0

R1# show ip nat statistics
Total active translations: 2 (0 static, 2 dynamic; 2 extended)
Outside interfaces:
  GigabitEthernet0/0
Inside interfaces:
  GigabitEthernet0/1.10, GigabitEthernet0/1.20, GigabitEthernet0/1.30, GigabitEthernet0/1.99
Hits: 12  Misses: 2
Expired translations: 10
Dynamic mappings:
  [Id: 1] access-list NAT_ACL interface GigabitEthernet0/0 overload

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW1# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_bad_dhcp: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES manual up                    up
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    20 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    30 deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255
    40 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.10      - 10.10.10.250      0
Pool Management-Pool :
 Current index        IP address range                    Leased address
 10.10.99.1           10.10.99.10      - 10.10.99.50       0

R1# show ip nat statistics
Total active translations: 2 (0 static, 2 dynamic; 2 extended)
Outside interfaces:
  GigabitEthernet0/0
Inside interfaces:
  GigabitEthernet0/1.10, GigabitEthernet0/1.20, GigabitEthernet0/1.30, GigabitEthernet0/1.99
Hits: 12  Misses: 2
Expired translations: 10
Dynamic mappings:
  [Id: 1] access-list NAT_ACL interface GigabitEthernet0/0 overload

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW1# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_acl_blocking_dns: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES manual up                    up
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    20 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    30 deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255
    40 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.10      - 10.10.10.250      0
Pool Guest-Pool :
 Current index        IP address range                    Leased address
 10.10.20.1           10.10.20.10      - 10.10.20.250      0
Pool Management-Pool :
 Current index        IP address range                    Leased address
 10.10.99.1           10.10.99.10      - 10.10.99.50       0

R1# show ip nat statistics
Total active translations: 2 (0 static, 2 dynamic; 2 extended)
Outside interfaces:
  GigabitEthernet0/0
Inside interfaces:
  GigabitEthernet0/1.10, GigabitEthernet0/1.20, GigabitEthernet0/1.30, GigabitEthernet0/1.99
Hits: 12  Misses: 2
Expired translations: 10
Dynamic mappings:
  [Id: 1] access-list NAT_ACL interface GigabitEthernet0/0 overload

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW1# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_guest_server_leak: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    20 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.10      - 10.10.10.250      0
Pool Guest-Pool :
 Current index        IP address range                    Leased address
 10.10.20.1           10.10.20.10      - 10.10.20.250      0

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99`,

    fault_insecure_ssh: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    20 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    30 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW1# show access-lists
Standard IP access list 99
    10 permit 10.10.10.0 0.0.0.255
    20 deny any

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99`,

    fault_nat_failure: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/0     203.0.113.2     YES manual up                    up
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    20 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    30 deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255
    40 permit ip any any
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255
    20 deny any

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.10      - 10.10.10.250      0
Pool Guest-Pool :
 Current index        IP address range                    Leased address
 10.10.20.1           10.10.20.10      - 10.10.20.250      0
Pool Management-Pool :
 Current index        IP address range                    Leased address
 10.10.99.1           10.10.99.10      - 10.10.99.50       0

R1# show ip nat statistics
Total active translations: 0 (0 static, 0 dynamic; 0 extended)
Outside interfaces:
Inside interfaces:
Hits: 0  Misses: 0
Expired translations: 0
Dynamic mappings:

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    
30   Server                           active    Fa0/10
99   Management                       active    Fa0/11

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW1# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show vlan brief
VLAN Name                             Status    Ports
---- -------------------------------- --------- -------------------------------
10   Employee                         active    Fa0/1, Fa0/2
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99`
};

// --- Tab Controller ---
const navButtons = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

const pageMeta = {
    dashboard: { title: "Executive Dashboard", subtitle: "Meridian Trust Bank branch network compliance status overview" },
    topology: { title: "Interactive Topology", subtitle: "Visual port connection mappings and dynamic SVI/subnet inspection" },
    plan: { title: "VLAN & IP Blueprint", subtitle: "VLAN subnets, IP assignments, DHCP ranges, and NAT/PAT blueprint details" },
    security: { title: "Security Matrix", subtitle: "Strict guest-isolation policies, application restrictions, and secure SSH rules" },
    tests: { title: "Connectivity Verification Lab", subtitle: "Automated reference ping and SSH compliance status checklist" },
    faults: { title: "Interactive Fault Injection Lab", subtitle: "Inject intentional faults, run diagnostic tool commands, and verify fixes" },
    validator: { title: "Configuration Audit Tool", subtitle: "Run local static log auditing against the master yaml blueprint" },
    "python-validator": { title: "Python Assurance Tool", subtitle: "Information and documentation on running the terminal-based validator.py" },
    configs: { title: "Cisco IOS Reference Configs", subtitle: "Representative switch and router CLI settings" },
    deliverables: { title: "Project Deliverables Checklist", subtitle: "Virtual Internship deliverables and upload status logs" },
    walkthrough: { title: "Video Presentation Guide", subtitle: "Timeline and slide breakdown for the 5-10 minute presentation demonstration" }
};

navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        
        // Update active class on buttons
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active class on tab panels
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(`tab-${tab}`).classList.add('active');

        // Update titles
        if (pageMeta[tab]) {
            pageTitle.textContent = pageMeta[tab].title;
            pageSubtitle.textContent = pageMeta[tab].subtitle;
        }
    });
});

// --- Predefined CLI Config File Manager ---
const configPreR1 = document.getElementById('pre-config-r1');
const configPreSW1 = document.getElementById('pre-config-sw1');
const configPreSW2 = document.getElementById('pre-config-sw2');
const deviceConfigButtons = document.querySelectorAll('.config-device-btn');

if (configPreR1 && configPreSW1 && configPreSW2) {
    configPreR1.textContent = iosReferenceConfigs.r1;
    configPreSW1.textContent = iosReferenceConfigs.sw1;
    configPreSW2.textContent = iosReferenceConfigs.sw2;
}

deviceConfigButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const device = btn.getAttribute('data-device-config');
        deviceConfigButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.config-pre').forEach(p => p.classList.remove('active'));
        document.getElementById(`pre-config-${device}`).classList.add('active');
    });
});

// Copy config helper
const copyConfigBtn = document.getElementById('copy-config-btn');
if (copyConfigBtn) {
    copyConfigBtn.addEventListener('click', () => {
        const activePre = document.querySelector('.config-pre.active');
        if (activePre) {
            navigator.clipboard.writeText(activePre.textContent)
                .then(() => {
                    showToast("Configuration copied to clipboard!");
                })
                .catch(err => {
                    console.error("Failed to copy text: ", err);
                });
        }
    });
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 2300);
}

// --- Topology Visualizer Controller ---
const deviceNodes = document.querySelectorAll('.device-node');
const infoDefaultView = document.getElementById('info-default-view');
const infoDetailView = document.getElementById('info-detail-view');
const infoTitle = document.getElementById('info-title');
const deviceNameTitle = document.getElementById('device-name-title');
const deviceTypeBadge = document.getElementById('device-type-badge');
const valModel = document.getElementById('val-model');
const valRole = document.getElementById('val-role');
const additionalDetails = document.getElementById('additional-details');

const nodeMeta = {
    "ISP-Cloud": {
        type: "Internet",
        model: "ISP WAN Gateway Cloud",
        role: "Edge Gateway Router ISP IP",
        details: `
            <div class="detail-item"><span class="label">ISP Address:</span><span class="value">203.0.113.1/30</span></div>
            <div class="detail-item"><span class="label">WAN Link Type:</span><span class="value">GigabitEthernet (Fiber)</span></div>
            <div class="detail-item"><span class="label">NAT Target:</span><span class="value">Router R1 Gi0/0</span></div>
        `
    },
    R1: {
        type: "Router",
        model: "Cisco 2911 ISR",
        role: "Edge Gateway & Inter-VLAN Routing",
        details: `
            <div class="detail-item"><span class="label">WAN SVI IP:</span><span class="value">203.0.113.2/30 (NAT Outside)</span></div>
            <div class="detail-item"><span class="label">Default Route:</span><span class="value">0.0.0.0/0 via 203.0.113.1</span></div>
            <div class="detail-item"><span class="label">LAN Trunk Port:</span><span class="value">GigabitEthernet0/1</span></div>
            <table class="topo-ports-table">
                <thead><tr><th>Subinterface</th><th>VLAN</th><th>Gateway IP</th></tr></thead>
                <tbody>
                    <tr><td>Gi0/1.10</td><td>10 (Employee)</td><td>10.10.10.1</td></tr>
                    <tr><td>Gi0/1.20</td><td>20 (Guest)</td><td>10.10.20.1</td></tr>
                    <tr><td>Gi0/1.30</td><td>30 (Server)</td><td>10.10.30.1</td></tr>
                    <tr><td>Gi0/1.99</td><td>99 (Management)</td><td>10.10.99.1</td></tr>
                </tbody>
            </table>
        `
    },
    SW1: {
        type: "Switch",
        model: "Cisco Catalyst 2960-24TT",
        role: "Core / Distribution Switch",
        details: `
            <div class="detail-item"><span class="label">Management IP:</span><span class="value">10.10.99.2/24 (Vlan 99 SVI)</span></div>
            <div class="detail-item"><span class="label">Default Gateway:</span><span class="value">10.10.99.1</span></div>
            <table class="topo-ports-table">
                <thead><tr><th>Interface</th><th>Mode</th><th>Assignment</th></tr></thead>
                <tbody>
                    <tr><td>Gi0/1</td><td>Trunk</td><td>Router R1 Gi0/1</td></tr>
                    <tr><td>Gi0/2</td><td>Trunk</td><td>Switch SW2 Gi0/2</td></tr>
                    <tr><td>Fa0/1 - 2</td><td>Access (VLAN 10)</td><td>Employee-PC01 / PC02</td></tr>
                    <tr><td>Fa0/10</td><td>Access (VLAN 30)</td><td>Server SRV-DNS-WEB</td></tr>
                    <tr><td>Fa0/11</td><td>Access (VLAN 99)</td><td>Management-PC01</td></tr>
                </tbody>
            </table>
        `
    },
    SW2: {
        type: "Switch",
        model: "Cisco Catalyst 2960-24TT",
        role: "Access Switch",
        details: `
            <div class="detail-item"><span class="label">Management IP:</span><span class="value">10.10.99.3/24 (Vlan 99 SVI)</span></div>
            <div class="detail-item"><span class="label">Default Gateway:</span><span class="value">10.10.99.1</span></div>
            <table class="topo-ports-table">
                <thead><tr><th>Interface</th><th>Mode</th><th>Assignment</th></tr></thead>
                <tbody>
                    <tr><td>Gi0/2</td><td>Trunk</td><td>Switch SW1 Gi0/2</td></tr>
                    <tr><td>Fa0/1 - 2</td><td>Access (VLAN 10)</td><td>Employee-PC03 / PC04</td></tr>
                    <tr><td>Fa0/20</td><td>Access (VLAN 20)</td><td>Wireless AP AP-01</td></tr>
                </tbody>
            </table>
        `
    },
    "SRV-DNS-WEB": {
        type: "Server",
        model: "Cisco Server Module",
        role: "Core Branch Server (DNS, HTTP)",
        details: `
            <div class="detail-item"><span class="label">Static IP Address:</span><span class="value">10.10.30.10/24</span></div>
            <div class="detail-item"><span class="label">Default Gateway:</span><span class="value">10.10.30.1</span></div>
            <div class="detail-item"><span class="label">DNS Domain name:</span><span class="value">server.smartbranch.local</span></div>
            <div class="detail-item"><span class="label">Access Security:</span><span class="value">Guest VLAN restricted (TCP blocked, DNS UDP allowed)</span></div>
        `
    },
    "AP-01": {
        type: "AccessPoint",
        model: "Generic AP (Bridge Mode)",
        role: "Wireless Access Point (Lobby Guests)",
        details: `
            <div class="detail-item"><span class="label">Access VLAN:</span><span class="value">20 (Guest VLAN subnet)</span></div>
            <div class="detail-item"><span class="label">Wireless SSID:</span><span class="value">Meridian_Guest (Open access)</span></div>
            <div class="detail-item"><span class="label">Switch connection:</span><span class="value">SW2 FastEthernet0/20</span></div>
        `
    }
};

deviceNodes.forEach(node => {
    node.addEventListener('mouseenter', () => {
        const devId = node.getAttribute('id');
        let meta = nodeMeta[devId];
        
        if (!meta) {
            const devName = node.getAttribute('data-device') || devId;
            const isGuest = devName.toLowerCase().includes('guest');
            const isMgt = devName.toLowerCase().includes('management');
            const isEmp = devName.toLowerCase().includes('employee');
            
            let vlan = "10";
            let ip = "10.10.10.x";
            let type = "Employee Client";
            if (isGuest) {
                vlan = "20";
                ip = "10.10.20.x";
                type = "Guest WiFi Client";
            } else if (isMgt) {
                vlan = "99";
                ip = "10.10.99.x";
                type = "Management IT Terminal";
            }

            meta = {
                type: "Endpoint",
                model: "Generic Workplace PC",
                role: type,
                details: `
                    <div class="detail-item"><span class="label">Device Name:</span><span class="value">${devName}</span></div>
                    <div class="detail-item"><span class="label">VLAN Assignment:</span><span class="value">VLAN ${vlan}</span></div>
                    <div class="detail-item"><span class="label">IP Address:</span><span class="value">${ip} (DHCP)</span></div>
                `
            };
        }

        infoDefaultView.classList.add('hidden');
        infoDetailView.classList.remove('hidden');

        infoTitle.textContent = `${meta.type} Specifications`;
        deviceTypeBadge.textContent = meta.type;
        deviceTypeBadge.className = 'badge';
        if (meta.type === "Router") deviceTypeBadge.classList.add('badge-danger');
        else if (meta.type === "Switch") deviceTypeBadge.classList.add('badge-neutral');
        else if (meta.type === "Server") deviceTypeBadge.classList.add('badge-warning');
        else if (meta.type === "Internet") deviceTypeBadge.classList.add('badge-success');
        else deviceTypeBadge.classList.add('badge-neutral');

        deviceNameTitle.textContent = node.getAttribute('data-device') || devId;
        valModel.textContent = meta.model;
        valRole.textContent = meta.role;
        additionalDetails.innerHTML = meta.details;
    });

    node.addEventListener('mouseleave', () => {
        infoDetailView.classList.add('hidden');
        infoDefaultView.classList.remove('hidden');
        infoTitle.textContent = "Network Info Profile";
    });
});

// --- JavaScript Custom Parser & Rule Engine for Audit Screen ---
function parseVlanRanges(vlanStr) {
    const vlans = new Set();
    if (!vlanStr || ['none', 'all'].includes(vlanStr.trim().toLowerCase())) {
        return vlans;
    }
    const parts = vlanStr.split(',');
    parts.forEach(part => {
        part = part.trim();
        if (part.includes('-')) {
            const rangeParts = part.split('-');
            const start = parseInt(rangeParts[0]);
            const end = parseInt(rangeParts[1]);
            if (!isNaN(start) && !isNaN(end)) {
                for (let i = start; i <= end; i++) vlans.add(i);
            }
        } else {
            const val = parseInt(part);
            if (!isNaN(val)) vlans.add(val);
        }
    });
    return vlans;
}

function wildcardToCidr(ipStr, wildcardStr) {
    if (ipStr.toLowerCase() === 'any' || wildcardStr.toLowerCase() === 'any') {
        return 'any';
    }
    if (wildcardStr.toLowerCase() === 'host' || !wildcardStr) {
        return `${ipStr}/32`;
    }
    try {
        const parts = wildcardStr.split('.');
        let wildcardBits = 0;
        parts.forEach(x => {
            wildcardBits += (parseInt(x).toString(2).match(/1/g) || []).length;
        });
        const cidr = 32 - wildcardBits;
        return `${ipStr}/${cidr}`;
    } catch (e) {
        return `${ipStr}/32`;
    }
}

class CommandParserJS {
    constructor() { this.devices = {}; }
    
    parseText(content) {
        const promptRegex = /^([A-Za-z0-9_\-]+)(?:#|>)\s*(show\s+[a-z0-9_\-\s|]+)$/i;
        let currentDevice = null;
        let currentCommand = null;
        let commandLines = [];

        const lines = content.split(/\r?\n/);
        lines.forEach(line => {
            const lineStripped = line.trim();
            const match = lineStripped.match(promptRegex);
            if (match) {
                if (currentDevice && currentCommand) {
                    this.storeCommandOutput(currentDevice, currentCommand, commandLines);
                }
                currentDevice = match[1].trim();
                currentCommand = match[2].trim().toLowerCase().replace(/\s+/g, ' ');
                commandLines = [];
            } else {
                if (currentDevice && currentCommand) {
                    commandLines.push(line);
                }
            }
        });

        if (currentDevice && currentCommand) {
            this.storeCommandOutput(currentDevice, currentCommand, commandLines);
        }
        return this.devices;
    }

    storeCommandOutput(device, command, lines) {
        if (!this.devices[device]) {
            this.devices[device] = {
                ip_interfaces: {}, trunks: {}, vlans: {}, access_lists: {}, dhcp_pools: {},
                nat: { inside: new Set(), outside: new Set(), overload: false }
            };
        }
        if (command.includes("ip int") || command.includes("ip interface brief")) {
            this.parseIpInterfaceBrief(device, lines);
        } else if (command.includes("trunk")) {
            this.parseInterfacesTrunk(device, lines);
        } else if (command.includes("vlan brief") || command.includes("vlan")) {
            this.parseVlanBrief(device, lines);
        } else if (command.includes("access-list")) {
            this.parseAccessLists(device, lines);
        } else if (command.includes("dhcp pool")) {
            this.parseDhcpPool(device, lines);
        } else if (command.includes("nat statistics") || command.includes("nat stat")) {
            this.parseNatStatistics(device, lines);
        }
    }

    parseIpInterfaceBrief(device, lines) {
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length === 0 || parts[0].toLowerCase() === 'interface' || parts[0].startsWith('---')) return;
            if (parts.length >= 2) {
                const ifaceName = parts[0];
                const ipAddr = parts[1];
                const status = parts[4] || "unknown";
                const protocol = parts[5] || "unknown";
                if (ipAddr.toLowerCase() !== 'unassigned') {
                    this.devices[device].ip_interfaces[ifaceName] = {
                        ip_address: ipAddr, status: status, protocol: protocol
                    };
                }
            }
        });
    }

    parseInterfacesTrunk(device, lines) {
        let allowedVlanSection = false;
        lines.forEach(line => {
            const lineLower = line.toLowerCase();
            if (lineLower.includes("vlans allowed on trunk")) {
                allowedVlanSection = true;
                return;
            } else if (lineLower.includes("vlans allowed and active")) {
                allowedVlanSection = false;
                return;
            } else if (!line.trim()) return;

            if (allowedVlanSection) {
                const parts = line.trim().split(/\s+/);
                if (parts.length === 0 || parts[0].toLowerCase() === 'port' || parts[0].startsWith('---')) return;
                if (parts.length >= 2) {
                    const port = parts[0];
                    const vlanStr = parts[1];
                    const vlans = parseVlanRanges(vlanStr);
                    if (!this.devices[device].trunks[port]) {
                        this.devices[device].trunks[port] = { allowed_vlans: new Set() };
                    }
                    vlans.forEach(v => this.devices[device].trunks[port].allowed_vlans.add(v));
                }
            }
        });
    }

    parseVlanBrief(device, lines) {
        lines.forEach(line => {
            if (!line.trim() || line.trim().toLowerCase().startsWith('vlan') || line.trim().startsWith('---')) return;
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                const vlanId = parseInt(parts[0]);
                if (!isNaN(vlanId)) {
                    this.devices[device].vlans[vlanId] = { name: parts[1], status: parts[2] };
                }
            }
        });
    }

    parseAccessLists(device, lines) {
        let currentAcl = null;
        let currentAclType = null;
        const aclHeaderRegex = /^(Standard|Extended)\s+IP\s+access\s+list\s+([A-Za-z0-9_\-]+)/i;
        const extendedRuleRegex = /^\s*(\d+)?\s*(permit|deny)\s+([a-z0-9]+)\s+(?:(host)\s+)?([0-9\.]+)(?:\s+([0-9\.]+))?\s+(?:(host)\s+)?([0-9\.]+)(?:\s+([0-9\.]+))?(?:\s+eq\s+([a-z0-9\-]+))?/i;
        const standardRuleRegex = /^\s*(\d+)?\s*(permit|deny)\s+(?:(host)\s+)?([0-9\.]+|any)(?:\s+([0-9\.]+))?/i;

        lines.forEach(line => {
            const lineStripped = line.trim();
            if (!lineStripped) return;
            const headerMatch = lineStripped.match(aclHeaderRegex);
            if (headerMatch) {
                currentAclType = headerMatch[1].toLowerCase();
                currentAcl = headerMatch[2];
                this.devices[device].access_lists[currentAcl] = { type: currentAclType, rules: [] };
                return;
            }

            if (currentAcl) {
                if (currentAclType === "extended") {
                    const match = lineStripped.match(extendedRuleRegex);
                    if (match) {
                        const action = match[2].toLowerCase();
                        const protocol = match[3].toLowerCase();
                        const srcHost = match[4];
                        const srcIp = match[5];
                        const srcWildcard = match[6] || (srcHost ? "0.0.0.0" : srcIp === "any" ? "0.0.0.0" : null);
                        const destHost = match[7];
                        const destIp = match[8];
                        const destWildcard = match[9] || (destHost ? "0.0.0.0" : destIp === "any" ? "0.0.0.0" : null);
                        const portStr = match[10];
                        let port = null;
                        if (portStr) {
                            const ps = portStr.toLowerCase();
                            if (ps === 'domain' || ps === 'dns') port = 53;
                            else if (ps === 'ssh') port = 22;
                            else {
                                const pVal = parseInt(ps);
                                port = isNaN(pVal) ? ps : pVal;
                            }
                        }
                        const srcCidr = srcWildcard ? wildcardToCidr(srcIp, srcWildcard) : srcIp;
                        const destCidr = destWildcard ? wildcardToCidr(destIp, destWildcard) : destIp;
                        this.devices[device].access_lists[currentAcl].rules.push({
                            action: action, protocol: protocol, source: srcCidr, destination: destCidr, destination_port: port
                        });
                    } else {
                        if (lineStripped.toLowerCase().includes("permit ip any any")) {
                            this.devices[device].access_lists[currentAcl].rules.push({
                                action: "permit", protocol: "ip", source: "any", destination: "any", destination_port: null
                            });
                        } else if (lineStripped.toLowerCase().includes("deny ip any any")) {
                            this.devices[device].access_lists[currentAcl].rules.push({
                                action: "deny", protocol: "ip", source: "any", destination: "any", destination_port: null
                            });
                        }
                    }
                } else if (currentAclType === "standard") {
                    const match = lineStripped.match(standardRuleRegex);
                    if (match) {
                        const action = match[2].toLowerCase();
                        const srcHost = match[3];
                        const srcIp = match[4];
                        const srcWildcard = match[5] || (srcHost ? "0.0.0.0" : srcIp === "any" ? "0.0.0.0" : null);
                        const srcCidr = srcWildcard ? wildcardToCidr(srcIp, srcWildcard) : srcIp;
                        this.devices[device].access_lists[currentAcl].rules.push({
                            action: action, source: srcCidr, protocol: "ip", destination: "any", destination_port: null
                        });
                    }
                }
            }
        });
    }

    parseDhcpPool(device, lines) {
        let currentPool = null;
        const poolHeaderRegex = /^Pool\s+([A-Za-z0-9_\-]+)\s*:/i;
        const rangeRegex = /^\s*([0-9\.]+)\s+([0-9\.]+)\s+-\s+([0-9\.]+)\s+\d+/i;

        lines.forEach(line => {
            const lineStripped = line.trim();
            if (!lineStripped) return;
            const headerMatch = lineStripped.match(poolHeaderRegex);
            if (headerMatch) {
                currentPool = headerMatch[1];
                this.devices[device].dhcp_pools[currentPool] = {};
                return;
            }
            if (currentPool) {
                const match = lineStripped.match(rangeRegex);
                if (match) {
                    this.devices[device].dhcp_pools[currentPool] = { start: match[2], end: match[3] };
                }
            }
        });
    }

    parseNatStatistics(device, lines) {
        let insideSec = false;
        let outsideSec = false;
        lines.forEach(line => {
            const lineStripped = line.trim();
            if (!lineStripped) return;
            if (lineStripped.toLowerCase().includes("inside interfaces:") || lineStripped.toLowerCase().includes("inside source")) {
                insideSec = true; outsideSec = false;
                if (lineStripped.includes(":")) {
                    lineStripped.split(":")[1].split(",").forEach(i => { if (i.trim()) this.devices[device].nat.inside.add(i.trim()); });
                }
                return;
            } else if (lineStripped.toLowerCase().includes("outside interfaces:")) {
                outsideSec = true; insideSec = false;
                if (lineStripped.includes(":")) {
                    lineStripped.split(":")[1].split(",").forEach(i => { if (i.trim()) this.devices[device].nat.outside.add(i.trim()); });
                }
                return;
            }
            if (insideSec && !lineStripped.startsWith("Hits") && !lineStripped.startsWith("Expired")) {
                lineStripped.split(",").forEach(p => {
                    const cleanP = p.trim();
                    if (cleanP && !cleanP.startsWith("[") && !cleanP.startsWith("Dynamic")) {
                        this.devices[device].nat.inside.add(cleanP);
                    }
                });
            }
            if (lineStripped.toLowerCase().includes("overload")) {
                this.devices[device].nat.overload = true;
            }
        });
    }
}

class RuleEngineJS {
    constructor(parsedData) {
        this.parsedData = parsedData;
        this.findings = [];
    }

    runAllChecks() {
        this.checkVlanExistence();
        this.checkWrongGateways();
        this.checkMissingVlansOnTrunks();
        this.checkDhcpScopeConflicts();
        this.checkGuestServerLeak();
        this.checkAclBlockingDns();
        this.checkSshAccessRestrictions();
        this.checkNatConfiguration();
        return this.findings;
    }

    checkVlanExistence() {
        siteConfig.vlans.forEach(vlan => {
            ["SW1", "SW2"].forEach(sw => {
                const swParsed = this.parsedData[sw] || {};
                const vlans = swParsed.vlans || {};
                if (!vlans[vlan.id] && (sw === "SW1" || vlan.id !== 30)) {
                    this.findings.push({
                        type: "trunk-issue", severity: "HIGH",
                        summary: `VLAN ${vlan.id} (${vlan.name}) Missing from Switch ${sw} Database`,
                        symptom: `Endpoints on VLAN ${vlan.id} cannot connect because Switch ${sw} drops packets for unrecognized VLAN tags.`,
                        fix: `vlan ${vlan.id}\n name ${vlan.name}`
                    });
                }
            });
        });
    }

    checkWrongGateways() {
        const r1 = this.parsedData.R1 || {};
        const ipInterfaces = r1.ip_interfaces || {};
        siteConfig.vlans.forEach(vlan => {
            const subifName = `GigabitEthernet0/1.${vlan.id}`;
            if (ipInterfaces[subifName]) {
                const cfgIp = ipInterfaces[subifName].ip_address.split('/')[0];
                if (cfgIp !== vlan.gateway) {
                    this.findings.push({
                        type: "gateway-issue", severity: "HIGH",
                        summary: `Wrong Gateway IP Configured on Router R1 sub-interface ${subifName}`,
                        symptom: `Endpoints in VLAN ${vlan.id} (${vlan.name}) cannot reach their default gateway ${vlan.gateway}. Routing fails.`,
                        fix: `interface ${subifName}\n ip address ${vlan.gateway} 255.255.255.0`
                    });
                }
            } else {
                this.findings.push({
                    type: "gateway-issue", severity: "HIGH",
                    summary: `Missing Gateway sub-interface ${subifName} on Router R1`,
                    symptom: `Endpoints in VLAN ${vlan.id} have no router gateway address configured, completely breaking routing.`,
                    fix: `interface ${subifName}\n encapsulation dot1Q ${vlan.id}\n ip address ${vlan.gateway} 255.255.255.0`
                });
            }
        });
    }

    checkMissingVlansOnTrunks() {
        const plannedVlans = new Set(siteConfig.vlans.map(v => v.id));
        siteConfig.devices.switches.forEach(sw => {
            const swParsed = this.parsedData[sw.name] || {};
            const trunks = swParsed.trunks || {};
            Object.keys(trunks).forEach(trunkName => {
                const allowed = trunks[trunkName].allowed_vlans || new Set();
                const missing = [];
                plannedVlans.forEach(v => { if (!allowed.has(v)) missing.push(v); });
                if (missing.length > 0) {
                    const missingStr = missing.sort((a,b) => a-b).join(',');
                    this.findings.push({
                        type: "trunk-issue", severity: "HIGH",
                        summary: `VLAN ${missingStr} Missing on Switch ${sw.name} Trunk Interface ${trunkName}`,
                        symptom: `Clients in VLAN(s) ${missingStr} connected to Switch ${sw.name} cannot send packets across trunk links.`,
                        fix: `interface ${trunkName}\n switchport trunk allowed vlan add ${missingStr}`
                    });
                }
            });
        });
    }

    checkDhcpScopeConflicts() {
        const r1 = this.parsedData.R1 || {};
        const dhcpPools = r1.dhcp_pools || {};
        siteConfig.vlans.forEach(vlan => {
            if (!vlan.dhcp_range) return;
            const poolName = Object.keys(dhcpPools).find(name => name.toLowerCase().includes(vlan.name.toLowerCase()));
            if (!poolName) {
                this.findings.push({
                    type: "gateway-issue", severity: "MEDIUM",
                    summary: `Missing DHCP Pool for ${vlan.name} VLAN ${vlan.id} on Router R1`,
                    symptom: `Clients in VLAN ${vlan.id} fail to obtain IP leases automatically.`,
                    fix: `ip dhcp pool ${vlan.name}-Pool\n network ${vlan.gateway.split('.').slice(0,3).join('.')}.0 255.255.255.0\n default-router ${vlan.gateway}`
                });
                return;
            }
            const poolData = dhcpPools[poolName];
            const startIp = poolData.start;
            const endIp = poolData.end;
            if (!startIp || !endIp) return;
            try {
                const gOctet = parseInt(vlan.gateway.split('.')[3]);
                const sOctet = parseInt(startIp.split('.')[3]);
                const eOctet = parseInt(endIp.split('.')[3]);
                if (sOctet <= gOctet && gOctet <= eOctet) {
                    this.findings.push({
                        type: "gateway-issue", severity: "MEDIUM",
                        summary: `DHCP Scope Conflict on Router R1 Pool ${poolName}`,
                        symptom: `Workstations intermittently experience IP collisions as R1 leases its default gateway address (${vlan.gateway}) to clients.`,
                        fix: `ip dhcp excluded-address ${vlan.gateway}`
                    });
                }
            } catch (e) {}
        });
    }

    checkGuestServerLeak() {
        const r1 = this.parsedData.R1 || {};
        const accessLists = r1.access_lists || {};
        const guestAcl = accessLists["GUEST_IN"];
        if (!guestAcl) {
            this.findings.push({
                type: "security-issue", severity: "CRITICAL",
                summary: "Missing Guest Isolation ACL on Router R1",
                symptom: "Guests on VLAN 20 can open full TCP/UDP connections to Server VLAN 30 and Management VLAN 99, violating bank security policies.",
                fix: "ip access-list extended GUEST_IN\n permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53\n deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255\n deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255\n permit ip any any"
            });
            return;
        }

        const rules = guestAcl.rules || [];
        let isolated = false;
        let permitAllBeforeDeny = false;
        let isolatedMgt = false;

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            if (rule.action === "permit" && rule.protocol === "ip" && rule.source === "any" && rule.destination === "any") {
                permitAllBeforeDeny = true;
            }
            if (rule.action === "deny" && rule.protocol === "ip") {
                const srcMatch = (rule.source === "10.10.20.0/24" || rule.source === "any");
                const destMatch = (rule.destination === "10.10.30.0/24" || rule.destination === "any" || rule.destination === "10.10.30.10/32");
                const mgtMatch = (rule.destination === "10.10.99.0/24" || rule.destination === "any");
                if (srcMatch && destMatch) {
                    if (!permitAllBeforeDeny) isolated = true;
                }
                if (srcMatch && mgtMatch) {
                    if (!permitAllBeforeDeny) isolatedMgt = true;
                }
            }
        }

        if (permitAllBeforeDeny && !isolated) {
            this.findings.push({
                type: "security-issue", severity: "CRITICAL",
                summary: "Ineffective Guest Isolation (Traffic Leak) due to Broad Permit Rule Placement",
                symptom: "Lobby guests can bypass guest isolation rules because the 'permit ip any any' rule is evaluated first.",
                fix: "Re-sequence GUEST_IN ACL rules so the deny statements are placed before the permit statement."
            });
        } else {
            if (!isolated) {
                this.findings.push({
                    type: "security-issue", severity: "CRITICAL",
                    summary: "Guest VLAN Traffic Leaking to Server VLAN on Router R1",
                    symptom: "Guests on VLAN 20 have access to core banking server SRV1 (10.10.30.10) because the deny rule is missing.",
                    fix: "ip access-list extended GUEST_IN\n deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255"
                });
            }
            if (!isolatedMgt) {
                this.findings.push({
                    type: "security-issue", severity: "CRITICAL",
                    summary: "Guest VLAN Security Leak to Management VLAN 99",
                    symptom: "Guests on VLAN 20 can reach device SVIs, enabling potential brute force SSH login screens.",
                    fix: "ip access-list extended GUEST_IN\n deny ip 10.10.20.0 0.0.0.255 10.10.99.0 0.0.0.255"
                });
            }
        }
    }

    checkAclBlockingDns() {
        const r1 = this.parsedData.R1 || {};
        const accessLists = r1.access_lists || {};
        const guestAcl = accessLists["GUEST_IN"];
        if (!guestAcl) return;

        const rules = guestAcl.rules || [];
        let dnsPermitted = false;
        let denyServerOccurred = false;

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            if (rule.action === "permit" && rule.protocol === "udp") {
                const destIpClean = rule.destination ? rule.destination.split('/')[0] : "";
                const destIsDns = (destIpClean === "10.10.30.10" || rule.destination === "10.10.30.0/24" || rule.destination === "any");
                const portIsDns = (rule.destination_port === 53);
                if (destIsDns && portIsDns) {
                    if (!denyServerOccurred) {
                        dnsPermitted = true;
                        break;
                    }
                }
            }
            if (rule.action === "deny" && rule.protocol === "ip") {
                const srcMatch = (rule.source === "10.10.20.0/24" || rule.source === "any");
                const destMatch = (rule.destination === "10.10.30.0/24" || rule.destination === "any" || (rule.destination && rule.destination.split('/')[0] === "10.10.30.10"));
                if (srcMatch && destMatch) denyServerOccurred = true;
            }
        }

        if (denyServerOccurred && !dnsPermitted) {
            this.findings.push({
                type: "security-issue", severity: "HIGH",
                summary: "Access Control List Blocking DNS Traffic on Router R1",
                symptom: "Guests cannot resolve domain names like google.com because DNS UDP/53 queries to DNS Server 10.10.30.10 are blocked by the ACL.",
                fix: "ip access-list extended GUEST_IN\n permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53\n(Ensure this is placed before the deny statement)"
            });
        }
    }

    checkSshAccessRestrictions() {
        ["R1", "SW1", "SW2"].forEach(deviceName => {
            const devParsed = this.parsedData[deviceName] || {};
            const accessLists = devParsed.access_lists || {};
            const mgtAcl = accessLists["99"] || accessLists["SSH_ONLY"];
            if (!mgtAcl) {
                this.findings.push({
                    type: "security-issue", severity: "HIGH",
                    summary: `Unsecured SSH Line Terminals on Device ${deviceName}`,
                    symptom: `Any workstation on the network can attempt SSH brute force logins to the CLI console on ${deviceName}.`,
                    fix: `access-list 99 permit 10.10.99.0 0.0.0.255\nline vty 0 15\n access-class 99 in`
                });
                return;
            }

            const rules = mgtAcl.rules || [];
            const allowedSources = new Set();
            let broadPermit = false;
            rules.forEach(rule => {
                if (rule.action === "permit") {
                    if (rule.source === "any") broadPermit = true;
                    else allowedSources.add(rule.source);
                }
            });

            const unauthorizedSources = [];
            allowedSources.forEach(src => {
                const cleanSrc = src.split('/')[0];
                if (cleanSrc !== "10.10.99.0" && src !== "any") unauthorizedSources.push(src);
            });

            if (broadPermit) {
                this.findings.push({
                    type: "security-issue", severity: "HIGH",
                    summary: `SSH Management Access Open to All Subnets on Device ${deviceName}`,
                    symptom: `Non-management subnets can SSH into the administration interface of ${deviceName}.`,
                    fix: `no access-list 99\naccess-list 99 permit 10.10.99.0 0.0.0.255`
                });
            } else if (unauthorizedSources.length > 0) {
                const unauthorizedStr = unauthorizedSources.join(', ');
                this.findings.push({
                    type: "security-issue", severity: "HIGH",
                    summary: `SSH Management Access Allowed from Non-Management Subnets on Device ${deviceName}`,
                    symptom: `Workstations in unauthorized subnets (${unauthorizedStr}) are permitted to SSH into ${deviceName}.`,
                    fix: `no access-list 99\naccess-list 99 permit 10.10.99.0 0.0.0.255`
                });
            }
        });
    }

    checkNatConfiguration() {
        const r1 = this.parsedData.R1 || {};
        const nat = r1.nat || { inside: new Set(), outside: new Set(), overload: false };
        
        if (!nat.outside || !nat.outside.has("GigabitEthernet0/0")) {
            this.findings.push({
                type: "gateway-issue", severity: "HIGH",
                summary: "NAT Outside Interface Not Configured on Router R1 WAN",
                symptom: "Internal endpoints cannot reach internet resources. NAT translation is not mapping mapped IP to the outside WAN.",
                fix: "interface GigabitEthernet0/0\n ip nat outside"
            });
        }

        const plannedInside = ["GigabitEthernet0/1.10", "GigabitEthernet0/1.20", "GigabitEthernet0/1.30", "GigabitEthernet0/1.99"];
        const missingInside = plannedInside.filter(iface => !nat.inside.has(iface));
        if (missingInside.length > 0) {
            const mStr = missingInside.join(", ");
            this.findings.push({
                type: "gateway-issue", severity: "HIGH",
                summary: `NAT Inside Interface Missing on R1 for: ${mStr}`,
                symptom: `Clients connected to ${mStr} subnets are unable to reach the WAN internet since NAT is disabled on their gateway interfaces.`,
                fix: missingInside.map(i => `interface ${i}\n ip nat inside`).join("\n")
            });
        }

        if (!nat.overload) {
            this.findings.push({
                type: "gateway-issue", severity: "HIGH",
                summary: "NAT PAT Overload Source Rule Missing on R1",
                symptom: "Pings fail to external networks as R1 is not performing dynamic Port Address Translation overload mapping.",
                fix: "ip nat inside source list NAT_ACL interface GigabitEthernet0/0 overload"
            });
        }
    }
}


// --- UI Form Audit Manager ---
const consoleLogsTextarea = document.getElementById('console-logs');
const runAuditBtn = document.getElementById('run-audit-btn');
const resultsPlaceholder = document.getElementById('results-placeholder');
const resultsList = document.getElementById('results-list');
const findingCountBadge = document.getElementById('finding-count');
const sampleSelect = document.getElementById('sample-select');

if (consoleLogsTextarea && sampleLogs.clean) {
    consoleLogsTextarea.value = sampleLogs.clean;
}

if (sampleSelect) {
    sampleSelect.addEventListener('change', () => {
        const val = sampleSelect.value;
        const mappedVal = (val === "fault_wrong_gateway" || val === "fault_missing_vlan_trunk" || val === "fault_bad_dhcp" || val === "fault_acl_blocking_dns" || val === "fault_guest_server_leak" || val === "fault_insecure_ssh") ? val : "clean";
        if (sampleLogs[val]) {
            consoleLogsTextarea.value = sampleLogs[val];
        }
    });
}

if (runAuditBtn) {
    runAuditBtn.addEventListener('click', () => {
        const rawLogs = consoleLogsTextarea.value;
        if (!rawLogs.trim()) {
            showToast("Please enter or select CLI logs to run the audit.");
            return;
        }

        // 1. Parse
        const parser = new CommandParserJS();
        const parsedData = parser.parseText(rawLogs);

        // 2. Run rule engine
        const engine = new RuleEngineJS(parsedData);
        const findings = engine.runAllChecks();

        // 3. Render
        renderFindings(findings);
        showToast("Audit complete! Findings updated.");
    });
}

function renderFindings(findings) {
    if (!resultsPlaceholder || !resultsList || !findingCountBadge) return;
    resultsPlaceholder.classList.add('hidden');
    resultsList.classList.remove('hidden');
    resultsList.innerHTML = '';

    findingCountBadge.textContent = `${findings.length} ${findings.length === 1 ? 'issue' : 'issues'}`;
    if (findings.length === 0) {
        findingCountBadge.className = 'badge badge-neutral';
        resultsList.innerHTML = `
            <div class="clean-card">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <h4>Configuration Validation Successful</h4>
                <p>All parsed device attributes match the site network blueprint. DHCP pools, trunks, SVI IPs, NAT rules, and ACL security policies are fully compliant.</p>
            </div>
        `;
    } else {
        findingCountBadge.className = 'badge badge-danger';
        findings.forEach(finding => {
            const card = document.createElement('div');
            const severityClass = finding.severity ? finding.severity.toLowerCase() : 'high';
            card.className = `finding-card ${finding.type || 'gateway-issue'} severity-${severityClass}`;
            
            card.innerHTML = `
                <div class="finding-card-header">
                    <span class="finding-severity">${finding.severity || 'HIGH'}</span>
                    <h4>${finding.summary}</h4>
                </div>
                <p class="symptom"><strong>Symptom:</strong> ${finding.symptom}</p>
                <div class="fix-container">
                    <span class="fix-label">Suggested Cisco IOS Fix:</span>
                    <pre>${finding.fix}</pre>
                </div>
            `;
            resultsList.appendChild(card);
        });
    }
}


// --- Fault Lab State & Action Controller ---
const faultInventory = {
    "1": {
        id: "FAULT-01",
        title: "Wrong Default Gateway",
        symptom: "Workstations in VLAN 10 (Employee) cannot ping their default gateway 10.10.10.1 and have lost all external network and server connection.",
        cause: "Router R1 GigabitEthernet0/1.10 SVI address has been misconfigured with 10.10.10.2/24 instead of 10.10.10.1/24.",
        evidence: "R1# show ip interface brief\nGigabitEthernet0/1.10  10.10.10.2      YES manual up                    up",
        fix: "R1(config)# interface GigabitEthernet0/1.10\nR1(config-subif)# ip address 10.10.10.1 255.255.255.0",
        logKey: "fault_wrong_gateway"
    },
    "2": {
        id: "FAULT-02",
        title: "Missing VLAN on Trunk Link",
        symptom: "Lobby guests are unable to connect to the network. DHCP IP address request times out, resulting in a self-assigned APIPA IP address.",
        cause: "VLAN 20 (Guest) has been accidentally omitted from the allowed trunk VLAN list on Switch SW2's uplink trunk interface GigabitEthernet0/2.",
        evidence: "SW2# show interfaces trunk\nPort        Vlans allowed on trunk\nGi0/2       10,30,99",
        fix: "SW2(config)# interface GigabitEthernet0/2\nSW2(config-if)# switchport trunk allowed vlan add 20",
        logKey: "fault_missing_vlan_trunk"
    },
    "3": {
        id: "FAULT-03",
        title: "DHCP Pool Subnet Mismatch",
        symptom: "Guest devices fail to obtain IP parameters and cannot connect. The network console shows DHCPDISCOVER timeouts.",
        cause: "The DHCP pool for VLAN 20 is completely missing from Router R1's active DHCP configurations.",
        evidence: "R1# show ip dhcp pool\nPool Employee-Pool :\n Current index 10.10.10.10 ...\nPool Management-Pool :\n Current index 10.10.99.10 ...\n(Guest-Pool is absent)",
        fix: "R1(config)# ip dhcp pool Guest-Pool\nR1(config-dhcp)# network 10.10.20.0 255.255.255.0\nR1(config-dhcp)# default-router 10.10.20.1\nR1(config-dhcp)# dns-server 10.10.30.10",
        logKey: "fault_bad_dhcp"
    },
    "4": {
        id: "FAULT-04",
        title: "ACL Blocking DNS Traffic",
        symptom: "Guests can ping public internet IP addresses like 8.8.8.8 directly, but domain names (like www.google.com) fail to load in the browser.",
        cause: "The extended ACL GUEST_IN denies traffic to 10.10.30.0/24 before permitting DNS queries (UDP 53) to the Server host 10.10.30.10.",
        evidence: "R1# show access-lists GUEST_IN\n    10 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255\n    20 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53",
        fix: "R1(config)# ip access-list extended GUEST_IN\nR1(config-ext-nacl)# no deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255\nR1(config-ext-nacl)# no permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53\nR1(config-ext-nacl)# permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53\nR1(config-ext-nacl)# deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255",
        logKey: "fault_acl_blocking_dns"
    },
    "5": {
        id: "FAULT-05",
        title: "NAT Overload Rule Failure",
        symptom: "Employees and guests can ping their local gateway sub-interfaces on R1 but cannot ping external WAN IP 203.0.113.1 or browse websites.",
        cause: "The NAT inside/outside interface parameters are missing, and no overload PAT source translation rule is configured on R1.",
        evidence: "R1# show ip nat statistics\nTotal active translations: 0\nOutside interfaces:\nInside interfaces:\nDynamic mappings:",
        fix: "R1(config)# interface GigabitEthernet0/0\nR1(config-if)# ip nat outside\nR1(config)# interface range GigabitEthernet0/1.10 , GigabitEthernet0/1.20 , GigabitEthernet0/1.30 , GigabitEthernet0/1.99\nR1(config-subif)# ip nat inside\nR1(config)# ip nat inside source list NAT_ACL interface GigabitEthernet0/0 overload",
        logKey: "fault_nat_failure"
    }
};

let activeFaultIdx = "1";
let labNetworkState = "HEALTHY"; // HEALTHY, FAULTY, DIAGNOSED, FIXED

const faultButtons = document.querySelectorAll('.fault-item-btn');
const btnInjectFault = document.getElementById('btn-inject-fault');
const btnRunDiagnosis = document.getElementById('btn-run-diagnosis');
const btnShowEvidence = document.getElementById('btn-show-evidence');
const btnVerifyFix = document.getElementById('btn-verify-fix');
const healthBadge = document.getElementById('network-health-badge');
const diagConsole = document.getElementById('diag-console');
const diagLog = document.getElementById('diag-log');

// Setup fault views
function selectFault(idx) {
    activeFaultIdx = idx;
    const fault = faultInventory[idx];
    if (!fault) return;

    document.getElementById('fault-lab-title').textContent = `${fault.id} Console: ${fault.title}`;
    document.getElementById('fault-symptom').textContent = fault.symptom;
    document.getElementById('fault-cause').textContent = fault.cause;
    
    // Reset views based on current state
    if (labNetworkState === "HEALTHY") {
        document.getElementById('fault-evidence').textContent = "Fault not injected yet. Click 'Inject Fault' below to begin.";
        document.getElementById('fault-fix').textContent = "Audit required. Awaiting fault injection.";
        btnInjectFault.disabled = false;
        btnRunDiagnosis.disabled = true;
        btnShowEvidence.disabled = true;
        btnVerifyFix.disabled = true;
        diagConsole.classList.add('hidden');
        healthBadge.textContent = "HEALTHY";
        healthBadge.className = "badge badge-success";
    } else if (labNetworkState === "FAULTY") {
        document.getElementById('fault-evidence').textContent = "[ENCRYPTED] Trigger the diagnosis scan to decrypt technical CLI log evidence.";
        document.getElementById('fault-fix').textContent = "Running diagnostics...";
        btnInjectFault.disabled = true;
        btnRunDiagnosis.disabled = false;
        btnShowEvidence.disabled = true;
        btnVerifyFix.disabled = true;
        diagConsole.classList.add('hidden');
        healthBadge.textContent = "FAULT INJECTED";
        healthBadge.className = "badge badge-danger";
    } else if (labNetworkState === "DIAGNOSED") {
        document.getElementById('fault-evidence').textContent = fault.evidence;
        document.getElementById('fault-fix').textContent = fault.fix;
        btnInjectFault.disabled = true;
        btnRunDiagnosis.disabled = true;
        btnShowEvidence.disabled = false;
        btnVerifyFix.disabled = false;
        healthBadge.textContent = "DIAGNOSED";
        healthBadge.className = "badge badge-warning";
    } else if (labNetworkState === "FIXED") {
        document.getElementById('fault-evidence').textContent = fault.evidence;
        document.getElementById('fault-fix').textContent = "FIX APPLIED SUCCESSFULLY\nConfiguration Compliant.";
        btnInjectFault.disabled = true;
        btnRunDiagnosis.disabled = true;
        btnShowEvidence.disabled = true;
        btnVerifyFix.disabled = true;
        healthBadge.textContent = "VERIFIED PASS";
        healthBadge.className = "badge badge-success";
    }
}

faultButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        faultButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Reset lab network state back to healthy when changing scenario to prevent cross-contamination
        labNetworkState = "HEALTHY";
        selectFault(btn.getAttribute('data-fault-idx'));
    });
});

if (btnInjectFault) {
    btnInjectFault.addEventListener('click', () => {
        labNetworkState = "FAULTY";
        selectFault(activeFaultIdx);
        showToast("Intentional configuration fault successfully injected!");
    });
}

if (btnRunDiagnosis) {
    btnRunDiagnosis.addEventListener('click', () => {
        labNetworkState = "DIAGNOSED";
        selectFault(activeFaultIdx);
        
        // Show console logs simulation
        diagConsole.classList.remove('hidden');
        const fault = faultInventory[activeFaultIdx];
        const logContent = sampleLogs[fault.logKey];
        
        // Parse & Run Checks
        const parser = new CommandParserJS();
        const parsed = parser.parseText(logContent);
        const engine = new RuleEngineJS(parsed);
        const findings = engine.runAllChecks();

        if (findings.length > 0) {
            let logText = `Checking device configuration logs...\nParsing command blocks...\nRunning security & gateway assertions...\n\n[\033[31mFAIL\033[0m] Validation check returned issues:\n`;
            findings.forEach(f => {
                logText += `\n>> FINDING: ${f.summary}\n>> SYMPTOM: ${f.symptom}\n>> SUGGESTED FIX:\n${f.fix}\n`;
            });
            diagLog.textContent = logText;
        } else {
            diagLog.textContent = "Checks completed. No findings detected.";
        }
        showToast("Diagnostics complete! Issues located.");
    });
}

if (btnShowEvidence) {
    btnShowEvidence.addEventListener('click', () => {
        showToast("Decrypted technical CLI evidence highlighted!");
    });
}

if (btnVerifyFix) {
    btnVerifyFix.addEventListener('click', () => {
        labNetworkState = "FIXED";
        selectFault(activeFaultIdx);
        diagConsole.classList.remove('hidden');
        diagLog.textContent = `Applying configuration repair commands...\nApplying fix...\nRe-running static rule validation...\n\n[\033[32mPASS\033[0m] Verification successful: 0 findings.\nAll devices are fully compliant with design blueprints. Pings and SSH tunnels restored.`;
        showToast("Fix applied! Network has returned to compliance.");
    });
}

// Select default fault on load
selectFault("1");
