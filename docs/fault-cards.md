# SmartBranch 360 Troubleshooting & Fault Cards

This document outlines the troubleshooting profile for each of the seeded configuration faults in the branch network. Each card represents a real-world troubleshooting ticket with **Symptom**, **Root Cause**, and **Resolution**.

---

## Fault Card 1: Incorrect Default Gateway on Router R1
- **File Reference:** `samples/fault_wrong_gateway.txt`
- **Symptom:** Wired teller workstations in VLAN 10 (Employee Subnet) cannot ping their default gateway (`10.10.10.1`), are unable to reach the internal banking server (`10.10.30.10`), and cannot connect to any external resources.
- **Root Cause:** The Router R1 sub-interface `GigabitEthernet0/1.10` has been misconfigured with the IP address `10.10.10.2 /24` instead of the correct gateway IP `10.10.10.1 /24`.
- **Fix:**
  Access Router R1 and reassign the correct IP to the sub-interface:
  ```ios
  R1# configure terminal
  R1(config)# interface GigabitEthernet0/1.10
  R1(config-subif)# ip address 10.10.10.1 255.255.255.0
  R1(config-subif)# end
  R1# write memory
  ```

---

## Fault Card 2: Missing VLAN 20 on SW2 Trunk Port
- **File Reference:** `samples/fault_missing_vlan_trunk.txt`
- **Symptom:** Guests attempting to connect to the lobby Wi-Fi (VLAN 20) are unable to obtain IP addresses via DHCP and cannot reach the internet.
- **Root Cause:** Switch SW2's trunk interface `GigabitEthernet0/2` (connecting SW2 to SW1) has omitted VLAN 20 from its list of allowed VLANs (configured as `10,30,99` instead of `10,20,30,99`). DHCP discover packets are dropped at SW2's trunk.
- **Fix:**
  Access Switch SW2 and add VLAN 20 to the trunk port:
  ```ios
  SW2# configure terminal
  SW2(config)# interface GigabitEthernet0/2
  SW2(config-if)# switchport trunk allowed vlan add 20
  SW2(config-if)# end
  SW2# write memory
  ```

---

## Fault Card 3: DHCP Scope Conflict on Router R1
- **File Reference:** `samples/fault_bad_dhcp.txt`
- **Symptom:** Workstations in VLAN 10 report duplicate IP address errors. The router experience packet loss and intermittent routing connectivity.
- **Root Cause:** The DHCP pool `Employee-Pool` is configured to allocate addresses starting from `10.10.10.1` because the gateway IP address (`10.10.10.1`) was not excluded.
- **Fix:**
  Access Router R1 and exclude the gateway IP from the DHCP pool scope:
  ```ios
  R1# configure terminal
  R1(config)# ip dhcp excluded-address 10.10.10.1
  R1(config)# end
  R1# write memory
  ```

---

## Fault Card 4: Access Control List Blocking DNS Traffic
- **File Reference:** `samples/fault_acl_blocking_dns.txt`
- **Symptom:** Guest clients on VLAN 20 can successfully ping external IP addresses (e.g. `8.8.8.8`) but cannot browse the web. Typing domain names (e.g. `www.google.com`) fails to resolve.
- **Root Cause:** In the GUEST_IN extended ACL, the deny statement blocking the Guest subnet from accessing the Server subnet (`deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255`) is placed at sequence number 10, whereas the permit DNS rule (`permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53`) is placed at sequence number 20. Because Cisco ACLs are evaluated top-down, DNS queries are dropped at sequence 10 before reaching the permit rule.
- **Fix:**
  Access Router R1, delete the GUEST_IN access-list, and reconfigure it so that the permit DNS statement is evaluated first:
  ```ios
  R1# configure terminal
  R1(config)# ip access-list extended GUEST_IN
  R1(config-ext-nacl)# no deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
  R1(config-ext-nacl)# no permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
  ! Re-add in the correct order:
  R1(config-ext-nacl)# permit udp 10.10.20.0 0.0.0.255 host 10.10.30.10 eq 53
  R1(config-ext-nacl)# deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
  R1(config-ext-nacl)# permit ip any any
  R1(config-ext-nacl)# end
  R1# write memory
  ```

---

## Fault Card 5: Guest-to-Server Traffic Leak
- **File Reference:** `samples/fault_guest_server_leak.txt`
- **Symptom:** Guest devices connected on the Lobby Wi-Fi (VLAN 20) can ping and access administrative file shares or databases on Server SRV1 (`10.10.30.10`), which violates regulatory compliance.
- **Root Cause:** The `GUEST_IN` access-list applied on Router R1's `GigabitEthernet0/1.20` interface is missing the deny rule to block traffic to VLAN 30, and immediately permits all traffic after the DNS permission.
- **Fix:**
  Access Router R1 and insert the deny rule into the GUEST_IN access-list:
  ```ios
  R1# configure terminal
  R1(config)# ip access-list extended GUEST_IN
  R1(config-ext-nacl)# deny ip 10.10.20.0 0.0.0.255 10.10.30.0 0.0.0.255
  ! Ensure this is placed before 'permit ip any any'. If not, recreate the ACL in the correct sequence.
  R1(config-ext-nacl)# end
  R1# write memory
  ```

---

## Fault Card 6: Insecure SSH Management ACL
- **File Reference:** `samples/fault_insecure_ssh.txt`
- **Symptom:** Users connected to the Employee VLAN 10 are able to initiate SSH connections to the core switch SW1 (`10.10.99.2`), allowing them to attempt brute-force login attacks.
- **Root Cause:** Access list 99 on Switch SW1 is misconfigured to permit the Employee subnet (`10.10.10.0/24`) instead of restricting to the Management subnet (`10.10.99.0/24`).
- **Fix:**
  Access Switch SW1, recreate ACL 99 to permit only the management subnet:
  ```ios
  SW1# configure terminal
  SW1(config)# no access-list 99
  SW1(config)# access-list 99 permit 10.10.99.0 0.0.0.255
  SW1(config)# access-list 99 deny any
  SW1(config)# end
  SW1# write memory
  ```
