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
ip access-list extended GUEST_IN
 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
 permit ip any any

ip access-list standard NAT_ACL
 permit 10.10.10.0 0.0.0.255
 permit 10.10.20.0 0.0.0.255
 permit 10.10.99.0 0.0.0.255

access-list 99 permit 10.10.99.0 0.0.0.255
access-list 99 deny any

! --- Interfaces ---
interface GigabitEthernet0/0
 description WAN Uplink to ISP
 ip address 192.168.1.100 255.255.255.0
 ip nat outside
 no shutdown

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

! --- NAT Translation ---
ip nat inside source list NAT_ACL interface GigabitEthernet0/0 overload

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
 description PC-Teller1
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/2
 description PC-Teller2
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/10
 description SRV1
 switchport mode access
 switchport access vlan 30
 spanning-tree portfast

interface FastEthernet0/11
 description PC-Admin
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
 description PC-Emp1
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/2
 description PC-Emp2
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/3
 description PC-Manager
 switchport mode access
 switchport access vlan 10
 spanning-tree portfast

interface FastEthernet0/20
 description WAP1
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
GigabitEthernet0/0     192.168.1.100   YES DHCP   up                    up
GigabitEthernet0/1     unassigned      YES unset  up                    up
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
Port        Mode             Encapsulation  Status        Native vlan
Gi0/1       on               802.1q         trunking      1
Gi0/2       on               802.1q         trunking      1
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
10   Employee                         active    Fa0/1, Fa0/2, Fa0/3
20   Guest                            active    Fa0/20

SW2# show interfaces trunk
Port        Mode             Encapsulation  Status        Native vlan
Gi0/2       on               802.1q         trunking      1
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_wrong_gateway: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1.10  10.10.10.2      YES manual up                    up
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

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_missing_vlan_trunk: `R1# show ip interface brief
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

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_bad_dhcp: `R1# show ip interface brief
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

R1# show ip dhcp pool
Pool Employee-Pool :
 Current index        IP address range                    Leased address
 10.10.10.1           10.10.10.1       - 10.10.10.250      0
Pool Guest-Pool :
 Current index        IP address range                    Leased address
 10.10.20.1           10.10.20.10      - 10.10.20.250      0

SW1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.2      YES manual up                    up

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

    fault_acl_blocking_dns: `R1# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
GigabitEthernet0/1.10  10.10.10.1      YES manual up                    up
GigabitEthernet0/1.20  10.10.20.1      YES manual up                    up
GigabitEthernet0/1.30  10.10.30.1      YES manual up                    up
GigabitEthernet0/1.99  10.10.99.1      YES manual up                    up

R1# show access-lists
Extended IP access list GUEST_IN
    10 deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
    20 permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
    30 permit ip any any
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

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

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

SW1# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/1       10,20,30,99
Gi0/2       10,20,30,99

SW2# show ip interface brief
Interface              IP-Address      OK? Method Status                Protocol
Vlan99                 10.10.99.3      YES manual up                    up

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`,

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

SW2# show interfaces trunk
Port        Vlans allowed on trunk
Gi0/2       10,20,30,99

SW2# show access-lists
Standard IP access list 99
    10 permit 10.10.99.0 0.0.0.255`
};

// --- Tab Controller ---
const navButtons = document.querySelectorAll('.nav-btn');
const tabContents = document.querySelectorAll('.tab-content');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

const pageMeta = {
    validator: { title: "Configuration Audit", subtitle: "Audit switch and router CLI outputs against design blueprints" },
    topology: { title: "Interactive Topology", subtitle: "Visual port mappings and live device specification inspection" },
    plan: { title: "Design Blueprint", subtitle: "VLAN partitions and core network security access controls" },
    configs: { title: "IOS Reference Configs", subtitle: "Clean copy-pasteable Cisco configuration reference templates" }
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

// --- Loaded Configuration File Manager ---
const configPreR1 = document.getElementById('pre-config-r1');
const configPreSW1 = document.getElementById('pre-config-sw1');
const configPreSW2 = document.getElementById('pre-config-sw2');
const deviceConfigButtons = document.querySelectorAll('.config-device-btn');

configPreR1.textContent = iosReferenceConfigs.r1;
configPreSW1.textContent = iosReferenceConfigs.sw1;
configPreSW2.textContent = iosReferenceConfigs.sw2;

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
document.getElementById('copy-config-btn').addEventListener('click', () => {
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
    R1: {
        type: "Router",
        model: "Cisco 2911",
        role: "Edge Gateway & Inter-VLAN Routing",
        details: `
            <div class="detail-item"><span class="label">WAN IP:</span><span class="value">192.168.1.100 (NAT)</span></div>
            <div class="detail-item"><span class="label">LAN Trunk:</span><span class="value">GigabitEthernet0/1</span></div>
            <div class="detail-item"><span class="label">VLAN Subinterfaces:</span><span class="value">4 Configured</span></div>
            <table class="topo-ports-table">
                <thead><tr><th>Subinterface</th><th>VLAN</th><th>IP Gateway</th></tr></thead>
                <tbody>
                    <tr><td>Gi0/1.10</td><td>10 (Employee)</td><td>10.10.10.1</td></tr>
                    <tr><td>Gi0/1.20</td><td>20 (Guest)</td><td>10.10.20.1</td></tr>
                    <tr><td>Gi0/1.30</td><td>30 (Server)</td><td>10.10.30.1</td></tr>
                    <tr><td>Gi0/1.99</td><td>99 (Mgt)</td><td>10.10.99.1</td></tr>
                </tbody>
            </table>
        `
    },
    SW1: {
        type: "Switch",
        model: "Cisco Catalyst 2960",
        role: "Distribution & Core Switch",
        details: `
            <div class="detail-item"><span class="label">Management IP:</span><span class="value">10.10.99.2</span></div>
            <div class="detail-item"><span class="label">Default Gateway:</span><span class="value">10.10.99.1</span></div>
            <table class="topo-ports-table">
                <thead><tr><th>Interface</th><th>Mode</th><th>Destination SVI</th></tr></thead>
                <tbody>
                    <tr><td>Gi0/1</td><td>Trunk</td><td>R1 Gi0/1</td></tr>
                    <tr><td>Gi0/2</td><td>Trunk</td><td>SW2 Gi0/2</td></tr>
                    <tr><td>Fa0/1-2</td><td>Access (VLAN 10)</td><td>PC-Teller1 / 2</td></tr>
                    <tr><td>Fa0/10</td><td>Access (VLAN 30)</td><td>Server SRV1</td></tr>
                    <tr><td>Fa0/11</td><td>Access (VLAN 99)</td><td>PC-Admin</td></tr>
                </tbody>
            </table>
        `
    },
    SW2: {
        type: "Switch",
        model: "Cisco Catalyst 2960",
        role: "Access Switch",
        details: `
            <div class="detail-item"><span class="label">Management IP:</span><span class="value">10.10.99.3</span></div>
            <div class="detail-item"><span class="label">Default Gateway:</span><span class="value">10.10.99.1</span></div>
            <table class="topo-ports-table">
                <thead><tr><th>Interface</th><th>Mode</th><th>Destination Device</th></tr></thead>
                <tbody>
                    <tr><td>Gi0/2</td><td>Trunk</td><td>SW1 Gi0/2</td></tr>
                    <tr><td>Fa0/1-2</td><td>Access (VLAN 10)</td><td>PC-Emp1 / PC-Emp2</td></tr>
                    <tr><td>Fa0/3</td><td>Access (VLAN 10)</td><td>PC-Manager</td></tr>
                    <tr><td>Fa0/20</td><td>Access (VLAN 20)</td><td>Wireless AP WAP1</td></tr>
                </tbody>
            </table>
        `
    },
    SRV1: {
        type: "Server",
        model: "Generic Branch Server",
        role: "Local Banking & Directory DNS",
        details: `
            <div class="detail-item"><span class="label">Static IP:</span><span class="value">10.10.30.10</span></div>
            <div class="detail-item"><span class="label">Subnet Mask:</span><span class="value">255.255.255.0</span></div>
            <div class="detail-item"><span class="label">Default Gateway:</span><span class="value">10.10.30.1</span></div>
            <div class="detail-item"><span class="label">Connected Port:</span><span class="value">SW1 FastEthernet0/10</span></div>
        `
    },
    WAP1: {
        type: "Wireless AP",
        model: "Generic AP (Bridge Mode)",
        role: "Lobby Guest Wi-Fi Access Point",
        details: `
            <div class="detail-item"><span class="label">Access VLAN:</span><span class="value">20 (Guest Subnet)</span></div>
            <div class="detail-item"><span class="label">SSID Name:</span><span class="value">Meridian_Guest</span></div>
            <div class="detail-item"><span class="label">Connected Port:</span><span class="value">SW2 FastEthernet0/20</span></div>
        `
    },
    "PC-Admin": {
        type: "Endpoint",
        model: "IT Workstation",
        role: "Secure Network Administration",
        details: `
            <div class="detail-item"><span class="label">Network VLAN:</span><span class="value">99 (Management)</span></div>
            <div class="detail-item"><span class="label">IP Allocation:</span><span class="value">DHCP (10.10.99.10 - 50)</span></div>
            <div class="detail-item"><span class="label">Connected Port:</span><span class="value">SW1 FastEthernet0/11</span></div>
        `
    }
};

deviceNodes.forEach(node => {
    node.addEventListener('mouseenter', () => {
        const devId = node.getAttribute('id');
        let meta = nodeMeta[devId];
        
        // Fallback for smaller generic endpoints
        if (!meta) {
            const devName = node.getAttribute('data-device') || devId;
            const isGuest = devName.toLowerCase().includes('guest');
            const isTeller = devName.toLowerCase().includes('teller');
            const isEmp = devName.toLowerCase().includes('emp') || devName.toLowerCase().includes('mgr');
            
            meta = {
                type: "Endpoint",
                model: "Generic Terminal Client",
                role: isGuest ? "Lobby Guest Laptop" : isTeller ? "Retail Teller Station" : "Branch Office Computer",
                details: `
                    <div class="detail-item"><span class="label">Device Name:</span><span class="value">${devName}</span></div>
                    <div class="detail-item"><span class="label">VLAN Assignment:</span><span class="value">${isGuest ? "20 (Guest)" : isEmp || isTeller ? "10 (Employee)" : "10"}</span></div>
                    <div class="detail-item"><span class="label">IP Address:</span><span class="value">DHCP Scope Lease</span></div>
                `
            };
        }

        infoDefaultView.classList.add('hidden');
        infoDetailView.classList.remove('hidden');

        infoTitle.textContent = `${meta.type} Specs`;
        deviceTypeBadge.textContent = meta.type;
        // Set styling badge
        deviceTypeBadge.className = 'badge';
        if (meta.type === "Router") deviceTypeBadge.classList.add('badge-danger');
        else if (meta.type === "Switch") deviceTypeBadge.classList.add('badge-neutral');
        else if (meta.type === "Server") deviceTypeBadge.classList.add('badge-warning');
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


// --- Javascript Client-Side Parser Engine ---

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
                for (let i = start; i <= end; i++) {
                    vlans.add(i);
                }
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
    constructor() {
        this.devices = {};
    }

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
                ip_interfaces: {},
                trunks: {},
                vlans: {},
                access_lists: {},
                dhcp_pools: {}
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
        }
    }

    parseIpInterfaceBrief(device, lines) {
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length === 0 || parts[0].toLowerCase() === 'interface' || parts[0].startsWith('---')) {
                return;
            }
            if (parts.length >= 2) {
                const ifaceName = parts[0];
                const ipAddr = parts[1];
                const status = parts[4] || "unknown";
                const protocol = parts[5] || "unknown";

                if (ipAddr.toLowerCase() !== 'unassigned') {
                    this.devices[device].ip_interfaces[ifaceName] = {
                        ip_address: ipAddr,
                        status: status,
                        protocol: protocol
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
            } else if (!line.trim()) {
                return;
            }

            if (allowedVlanSection) {
                const parts = line.trim().split(/\s+/);
                if (parts.length === 0 || parts[0].toLowerCase() === 'port' || parts[0].startsWith('---')) {
                    return;
                }
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
            if (!line.trim() || line.trim().toLowerCase().startsWith('vlan') || line.trim().startsWith('---')) {
                return;
            }
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3) {
                const vlanId = parseInt(parts[0]);
                if (!isNaN(vlanId)) {
                    const vlanName = parts[1];
                    const status = parts[2];
                    this.devices[device].vlans[vlanId] = {
                        name: vlanName,
                        status: status
                    };
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
                this.devices[device].access_lists[currentAcl] = {
                    type: currentAclType,
                    rules: []
                };
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
                            action: action,
                            protocol: protocol,
                            source: srcCidr,
                            destination: destCidr,
                            destination_port: port
                        });
                    } else {
                        if (lineStripped.toLowerCase().includes("permit ip any any")) {
                            this.devices[device].access_lists[currentAcl].rules.push({
                                action: "permit",
                                protocol: "ip",
                                source: "any",
                                destination: "any",
                                destination_port: null
                            });
                        } else if (lineStripped.toLowerCase().includes("deny ip any any")) {
                            this.devices[device].access_lists[currentAcl].rules.push({
                                action: "deny",
                                protocol: "ip",
                                source: "any",
                                destination: "any",
                                destination_port: null
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
                            action: action,
                            source: srcCidr,
                            protocol: "ip",
                            destination: "any",
                            destination_port: null
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
                    const startIp = match[2];
                    const endIp = match[3];
                    this.devices[device].dhcp_pools[currentPool] = {
                        start: startIp,
                        end: endIp
                    };
                }
            }
        });
    }
}


// --- Javascript Client-Side Rule Engine ---

class RuleEngineJS {
    constructor(parsedData) {
        this.parsedData = parsedData;
        this.findings = [];
    }

    runAllChecks() {
        this.checkWrongGateways();
        this.checkMissingVlansOnTrunks();
        this.checkDhcpScopeConflicts();
        this.checkGuestServerLeak();
        this.checkAclBlockingDns();
        this.checkSshAccessRestrictions();
        return this.findings;
    }

    checkWrongGateways() {
        // Router gateways
        const vlans = siteConfig.vlans;
        const r1 = this.parsedData.R1 || {};
        const ipInterfaces = r1.ip_interfaces || {};

        vlans.forEach(vlan => {
            const subifName = `GigabitEthernet0/1.${vlan.id}`;
            if (ipInterfaces[subifName]) {
                const cfgIp = ipInterfaces[subifName].ip_address.split('/')[0];
                if (cfgIp !== vlan.gateway) {
                    this.findings.push({
                        type: "gateway-issue",
                        summary: `Wrong Gateway IP Configured on Router R1 sub-interface ${subifName}`,
                        symptom: `Endpoints in VLAN ${vlan.id} (${vlan.name}) cannot ping their default gateway ${vlan.gateway} and cannot access external networks.`,
                        fix: `interface ${subifName}\n ip address ${vlan.gateway} 255.255.255.0`
                    });
                }
            } else {
                this.findings.push({
                    type: "gateway-issue",
                    summary: `Missing Gateway sub-interface ${subifName} on Router R1`,
                    symptom: `Endpoints in VLAN ${vlan.id} have no default gateway defined on the router, completely breaking inter-VLAN routing.`,
                    fix: `interface ${subifName}\n encapsulation dot1Q ${vlan.id}\n ip address ${vlan.gateway} 255.255.255.0`
                });
            }
        });

        // Switch SVIs
        siteConfig.devices.switches.forEach(sw => {
            const swParsed = this.parsedData[sw.name] || {};
            const swIps = swParsed.ip_interfaces || {};
            const plannedMgtIp = sw.management_ip.split('/')[0];

            if (swIps["Vlan99"]) {
                const cfgIp = swIps["Vlan99"].ip_address.split('/')[0];
                if (cfgIp !== plannedMgtIp) {
                    this.findings.push({
                        type: "gateway-issue",
                        summary: `Wrong Management IP Configured on Switch ${sw.name} SVI Vlan99`,
                        symptom: `IT administrators are unable to access Switch ${sw.name} via SSH because the management IP address (${cfgIp}) is misconfigured.`,
                        fix: `interface Vlan99\n ip address ${plannedMgtIp} 255.255.255.0`
                    });
                }
            } else {
                this.findings.push({
                    type: "gateway-issue",
                    summary: `Missing SVI Vlan99 on Switch ${sw.name}`,
                    symptom: `Administrators cannot connect to Switch ${sw.name} over the network.`,
                    fix: `interface Vlan99\n ip address ${plannedMgtIp} 255.255.255.0\n no shutdown`
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
                plannedVlans.forEach(v => {
                    if (!allowed.has(v)) missing.push(v);
                });

                if (missing.length > 0) {
                    const missingStr = missing.sort((a,b) => a-b).join(',');
                    this.findings.push({
                        type: "trunk-issue",
                        summary: `VLAN ${missingStr} Missing from Switch ${sw.name} Trunk Interface ${trunkName}`,
                        symptom: `Clients in VLAN(s) ${missingStr} connected to Switch ${sw.name} cannot communicate across switches or reach their gateway.`,
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
                    type: "gateway-issue",
                    summary: `Missing DHCP Pool for ${vlan.name} VLAN ${vlan.id} on Router R1`,
                    symptom: `Clients in VLAN ${vlan.id} do not receive IP addresses automatically and experience a total lack of network access.`,
                    fix: `ip dhcp pool ${vlan.name}-Pool\n network ${vlan.gateway.split('.').slice(0,3).join('.')}.0 255.255.255.0\n default-router ${vlan.gateway}\n dns-server 10.10.30.10`
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
                        type: "gateway-issue",
                        summary: `DHCP Scope Conflict on Router R1 Pool ${poolName}`,
                        symptom: `IP conflicts occur intermittently as the router leases its own gateway IP address (${vlan.gateway}) to client workstations.`,
                        fix: `ip dhcp excluded-address ${vlan.gateway}`
                    });
                } else if (startIp !== vlan.dhcp_range.start || endIp !== vlan.dhcp_range.end) {
                    this.findings.push({
                        type: "gateway-issue",
                        summary: `Incorrect DHCP Range Configured on Router R1 Pool ${poolName}`,
                        symptom: `Workstations in VLAN ${vlan.id} receive IPs outside the design bounds, causing IP pool depletion.`,
                        fix: `Correct the DHCP scope addresses under the pool configuration.`
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
                type: "security-issue",
                summary: "Missing Guest Isolation ACL on Router R1",
                symptom: "Lobby guests on VLAN 20 can freely ping and open connections to the secure Server VLAN 30, violating bank compliance policies.",
                fix: "ip access-list extended GUEST_IN\n deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255\n permit ip any any\ninterface GigabitEthernet0/1.20\n ip access-group GUEST_IN in"
            });
            return;
        }

        const rules = guestAcl.rules || [];
        let isolated = false;
        let permitAllBeforeDeny = false;

        for (let i = 0; i < rules.length; i++) {
            const rule = rules[i];
            
            if (rule.action === "permit" && rule.protocol === "ip" && rule.source === "any" && rule.destination === "any") {
                permitAllBeforeDeny = true;
            }

            if (rule.action === "deny" && rule.protocol === "ip") {
                const srcMatch = (rule.source === "10.10.20.0/24" || rule.source === "any");
                const destMatch = (rule.destination === "10.10.30.0/24" || rule.destination === "any");
                if (srcMatch && destMatch) {
                    if (!permitAllBeforeDeny) {
                        isolated = true;
                        break;
                    }
                }
            }
        }

        if (permitAllBeforeDeny && !isolated) {
            this.findings.push({
                type: "security-issue",
                summary: "Ineffective Guest Isolation (Traffic Leak) due to Broad Permit Rule Placement",
                symptom: "Lobby guests can bypass guest isolation policies because the 'permit ip any any' rule is placed before the blocking rule.",
                fix: "Re-sequence the GUEST_IN ACL rules so the 'deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255' statement is evaluated first."
            });
        } else if (!isolated) {
            this.findings.push({
                type: "security-issue",
                summary: "Guest VLAN Traffic Leaking to Server VLAN on Router R1",
                symptom: "Guests on VLAN 20 have access to core banking server SRV1 (10.10.30.10) because the guest ACL is missing the deny rule.",
                fix: "ip access-list extended GUEST_IN\n deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255"
            });
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
                if (srcMatch && destMatch) {
                    denyServerOccurred = true;
                }
            }
        }

        if (denyServerOccurred && !dnsPermitted) {
            this.findings.push({
                type: "security-issue",
                summary: "Access Control List Blocking DNS Traffic on Router R1",
                symptom: "Guests can ping public IP addresses like 8.8.8.8 but cannot browse websites because domain resolution queries to DNS Server 10.10.30.10 are blocked by the ACL.",
                fix: "Reorder GUEST_IN ACL rules to permit DNS traffic before blocking subnet traffic:\nip access-list extended GUEST_IN\n permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53"
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
                    type: "security-issue",
                    summary: `Insecure SSH Configuration on Device ${deviceName}`,
                    symptom: `Any workstation on the network can attempt SSH access to the terminal CLI of ${deviceName}, posing a security hazard.`,
                    max: `access-list 99 permit 10.10.99.0 0.0.0.255\nline vty 0 15\n access-class 99 in`,
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
                if (cleanSrc !== "10.10.99.0" && src !== "any") {
                    unauthorizedSources.push(src);
                }
            });

            if (broadPermit) {
                this.findings.push({
                    type: "security-issue",
                    summary: `SSH Management Access Open to All Subnets on Device ${deviceName}`,
                    symptom: `Users on Guest or Employee VLANs can access the SSH administrative login screen of ${deviceName}.`,
                    fix: `no access-list 99\naccess-list 99 permit 10.10.99.0 0.0.0.255`
                });
            } else if (unauthorizedSources.length > 0) {
                const unauthorizedStr = unauthorizedSources.join(', ');
                this.findings.push({
                    type: "security-issue",
                    summary: `SSH Management Access Allowed from Non-Management Subnets on Device ${deviceName}`,
                    symptom: `Devices in unauthorized subnets (${unauthorizedStr}) are permitted to connect via SSH to ${deviceName}.`,
                    fix: `no access-list 99\naccess-list 99 permit 10.10.99.0 0.0.0.255`
                });
            }
        });
    }
}


// --- UI Form Audit Manager ---
const consoleLogsTextarea = document.getElementById('console-logs');
const runAuditBtn = document.getElementById('run-audit-btn');
const resultsPlaceholder = document.getElementById('results-placeholder');
const resultsList = document.getElementById('results-list');
const findingCountBadge = document.getElementById('finding-count');
const sampleSelect = document.getElementById('sample-select');

// Set default clean sample
consoleLogsTextarea.value = sampleLogs.clean;

sampleSelect.addEventListener('change', () => {
    const val = sampleSelect.value;
    if (sampleLogs[val]) {
        consoleLogsTextarea.value = sampleLogs[val];
    }
});

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

function renderFindings(findings) {
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
                <p>All parsed device attributes match the site network blueprint. DHCP scopes, trunks, SVI IPs, and ACL security policies are fully compliant.</p>
            </div>
        `;
    } else {
        findingCountBadge.className = 'badge badge-danger';
        findings.forEach(finding => {
            const card = document.createElement('div');
            card.className = `finding-card ${finding.type}`;
            
            card.innerHTML = `
                <h4>${finding.summary}</h4>
                <p class="symptom"><strong>Symptom:</strong> ${finding.symptom}</p>
                <div class="fix-container">
                    <span class="fix-label">Suggested CLI Fix:</span>
                    <pre>${finding.fix}</pre>
                </div>
            `;
            resultsList.appendChild(card);
        });
    }
}
