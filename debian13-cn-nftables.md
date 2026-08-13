可以，下面这份可以直接保存成 `README.md` 或 `debian13-cn-nftables.md`。

# Debian 13：限制 10000+ 端口仅中国大陆 IPv4 访问

## 目标

在 Debian 13 VPS 上使用 `nftables` 实现：

* TCP `10000-65535`：仅允许中国大陆 IPv4 访问
* UDP `10000-65535`：仅允许中国大陆 IPv4 访问
* 非中国大陆 IPv4：丢弃
* 其他端口：不受影响
* Docker 现有规则：不修改
* 中国大陆 IP 段：自动更新
* VPS 重启后：自动恢复规则

> 本方案只处理 IPv4。当前 VPS 没有公网 IPv6，因此无需处理 IPv6。

---

## 1. 环境

系统：

```text
Debian 13
```

nftables：

```text
nftables v1.1.3
```

检查：

```bash
nft --version
```

检查 nftables 服务：

```bash
systemctl status nftables --no-pager
```

---

## 2. 检查现有 nftables 规则

```bash
nft list ruleset
```

如果使用 Docker，可能会看到：

```text
Warning: table ip nat is managed by iptables-nft, do not touch!
Warning: table ip filter is managed by iptables-nft, do not touch!
```

这是正常的。

**不要直接修改 Docker 的以下表：**

```text
table ip nat
table ip filter
table ip6 nat
table ip6 filter
```

本方案单独创建：

```text
table ip cnfilter
```

避免与 Docker 冲突。

---

## 3. 安装依赖

```bash
apt update
apt install -y nftables curl
```

---

## 4. 创建中国大陆 IP 自动更新脚本

创建：

```bash
nano /usr/local/sbin/update-cn-nft.sh
```

写入：

```bash
#!/bin/bash

set -euo pipefail

URL="https://www.ipdeny.com/ipblocks/data/aggregated/cn-aggregated.zone"
TMP="/tmp/cn-aggregated.zone.$$"
NFTTMP="/tmp/cnfilter.nft.$$"

cleanup() {
    rm -f "$TMP" "$NFTTMP"
}

trap cleanup EXIT

echo "[+] Downloading China IPv4 CIDR list..."

curl -fL --retry 3 --connect-timeout 10 \
    "$URL" -o "$TMP"

LINES=$(grep -cE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/' "$TMP" || true)

# 防止下载失败或异常文件导致白名单被清空
if [ "$LINES" -lt 1000 ]; then
    echo "[ERROR] China CIDR list looks invalid: $LINES entries"
    exit 1
fi

echo "[+] Got $LINES China IPv4 networks"

{
    echo 'table ip cnfilter {'

    echo '    set cn_ipv4 {'
    echo '        type ipv4_addr'
    echo '        flags interval'
    echo '        elements = {'

    sed 's/$/,/' "$TMP"

    echo '        }'
    echo '    }'

    echo ''
    echo '    chain input {'
    echo '        type filter hook input priority -10; policy accept;'
    echo ''
    echo '        ct state established,related accept'
    echo '        iifname "lo" accept'
    echo ''
    echo '        ip saddr @cn_ipv4 tcp dport 10000-65535 accept'
    echo '        ip saddr @cn_ipv4 udp dport 10000-65535 accept'
    echo ''
    echo '        tcp dport 10000-65535 drop'
    echo '        udp dport 10000-65535 drop'
    echo '    }'

    echo '}'
} > "$NFTTMP"

echo "[+] Testing nftables configuration..."

nft -c -f "$NFTTMP"

echo "[+] Configuration OK"

echo "[+] Replacing cnfilter table..."

nft delete table ip cnfilter 2>/dev/null || true

nft -f "$NFTTMP"

echo "[+] Done."

echo "[+] Loaded China IPv4 networks: $LINES"
```

添加执行权限：

```bash
chmod +x /usr/local/sbin/update-cn-nft.sh
```

---

## 5. 第一次加载中国大陆 IP

执行：

```bash
/usr/local/sbin/update-cn-nft.sh
```

正常情况下会看到：

```text
[+] Downloading China IPv4 CIDR list...
[+] Got xxxx China IPv4 networks
[+] Testing nftables configuration...
[+] Configuration OK
[+] Replacing cnfilter table...
[+] Done.
[+] Loaded China IPv4 networks: xxxx
```

---

## 6. 检查 nftables 规则

查看整个表：

```bash
nft list table ip cnfilter
```

应该包含类似：

```text
table ip cnfilter {
    set cn_ipv4 {
        type ipv4_addr
        flags interval
        elements = {
            ...
        }
    }

    chain input {
        type filter hook input priority filter - 10; policy accept;

        ct state established,related accept
        iifname "lo" accept

        ip saddr @cn_ipv4 tcp dport 10000-65535 accept
        ip saddr @cn_ipv4 udp dport 10000-65535 accept

        tcp dport 10000-65535 drop
        udp dport 10000-65535 drop
    }
}
```

查看中国 IP 网段数量：

```bash
nft list set ip cnfilter cn_ipv4 | grep -cE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/'
```

---

## 7. 规则逻辑

实际访问逻辑：

```text
                  Internet
                     │
                     ▼
             TCP/UDP 10000+
                     │
             ┌───────▼───────┐
             │ 来源 IP 是 CN? │
             └───────┬───────┘
                 是 /   \ 否
                   /     \
                  ▼       ▼
               ACCEPT    DROP
```

只有以下端口受到限制：

```text
TCP 10000-65535
UDP 10000-65535
```

例如：

| 端口        | 中国大陆 | 海外   |
| --------- | ---- | ---- |
| 22        | 不受影响 | 不受影响 |
| 80        | 不受影响 | 不受影响 |
| 443       | 不受影响 | 不受影响 |
| TCP 10000 | 允许   | 丢弃   |
| TCP 20000 | 允许   | 丢弃   |
| TCP 65535 | 允许   | 丢弃   |
| UDP 10000 | 允许   | 丢弃   |

---

## 8. 设置开机自动加载

保存当前规则：

```bash
nft list table ip cnfilter > /etc/nftables-cnfilter.nft
```

创建 systemd service：

```bash
nano /etc/systemd/system/cnfilter.service
```

写入：

```ini
[Unit]
Description=China IPv4 nftables filter
After=network-online.target
Wants=network-online.target
Before=docker.service

[Service]
Type=oneshot
ExecStart=/usr/sbin/nft -f /etc/nftables-cnfilter.nft
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
```

重新加载 systemd：

```bash
systemctl daemon-reload
```

设置开机启动：

```bash
systemctl enable cnfilter.service
```

立即测试：

```bash
systemctl start cnfilter.service
```

检查：

```bash
systemctl status cnfilter.service --no-pager
```

正常应该显示：

```text
Active: active (exited)
```

---

## 9. 设置中国 IP 自动更新

创建 service：

```bash
nano /etc/systemd/system/update-cn-nft.service
```

内容：

```ini
[Unit]
Description=Update China IPv4 nftables list
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/update-cn-nft.sh
```

创建 timer：

```bash
nano /etc/systemd/system/update-cn-nft.timer
```

内容：

```ini
[Unit]
Description=Daily update China IPv4 nftables list

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
```

重新加载：

```bash
systemctl daemon-reload
```

启用并立即启动定时器：

```bash
systemctl enable --now update-cn-nft.timer
```

检查：

```bash
systemctl status update-cn-nft.timer --no-pager
```

查看下一次执行时间：

```bash
systemctl list-timers update-cn-nft.timer
```

---

## 10. 手动测试自动更新

不需要等到凌晨，直接执行：

```bash
systemctl start update-cn-nft.service
```

查看日志：

```bash
journalctl -u update-cn-nft.service -n 50 --no-pager
```

检查规则：

```bash
nft list table ip cnfilter
```

---

## 11. 检查开机启动状态

检查：

```bash
systemctl is-enabled cnfilter.service
```

应该：

```text
enabled
```

检查：

```bash
systemctl is-enabled update-cn-nft.timer
```

应该：

```text
enabled
```

检查 timer：

```bash
systemctl list-timers | grep cn
```

---

## 12. 测试访问

假设服务器公网 IP：

```text
YOUR_PUBLIC_IP
```

中国大陆机器测试：

```bash
nc -vz YOUR_PUBLIC_IP 10000
```

如果该端口有服务监听，应该能够连接。

海外 VPS 测试：

```bash
nc -vz YOUR_PUBLIC_IP 10000
```

应该无法建立连接。

UDP 可以测试：

```bash
nc -vzu YOUR_PUBLIC_IP 10000
```

> UDP 的 `nc` 测试结果不如 TCP 直观，最好结合实际 UDP 服务进行验证。

---

## 13. 查看 nftables 命中计数

```bash
nft list chain ip cnfilter input
```

可以看到类似：

```text
ip saddr @cn_ipv4 tcp dport 10000-65535 accept
ip saddr @cn_ipv4 udp dport 10000-65535 accept
tcp dport 10000-65535 drop
udp dport 10000-65535 drop
```

如果规则被访问，`counter` 计数可以用来观察命中情况。

---

## 14. 关于 Docker

本方案不会修改 Docker 自己管理的：

```text
table ip nat
table ip filter
table ip6 nat
table ip6 filter
```

Docker 使用的是 `iptables-nft`。

本方案另外创建：

```text
table ip cnfilter
```

因此不会主动清除 Docker 的 NAT/FORWARD 规则。

> 注意：本方案针对的是进入 VPS 本机 `INPUT` 路径的服务。如果以后需要限制 Docker 发布到公网的端口，需要另外针对 Docker 的 FORWARD 路径配置。

---

## 15. 关于 IPv6

本方案只限制：

```text
IPv4
```

当前服务器：

```text
eth0
10.0.6.198/24
fe80::/64
```

只有链路本地 IPv6，没有公网 IPv6，因此目前没有问题。

如果以后 VPS 获得公网 IPv6，例如：

```text
2xxx:xxxx:xxxx::/64
```

需要另外配置中国大陆 IPv6 白名单，否则 IPv6 可能绕过 IPv4 的限制。

---

## 16. 阿里云安全组

VPS 的 `eth0` 是：

```text
10.0.6.198
```

说明公网访问经过阿里云网络层。

阿里云安全组负责控制：

```text
公网 → VPS
```

nftables 负责：

```text
进入 VPS → Linux 内核 → 服务
```

建议安全组至少保证实际需要的端口开放。

对于 `10000-65535`，如果需要由 nftables 根据来源 IP 判断，可以保持安全组允许对应流量进入，然后由 VPS 内部的 nftables 判断是否为中国大陆 IP。

---

## 17. 常用维护命令

### 查看规则

```bash
nft list table ip cnfilter
```

### 查看中国 IP 集合

```bash
nft list set ip cnfilter cn_ipv4
```

### 查看规则计数

```bash
nft list chain ip cnfilter input
```

### 手动更新

```bash
systemctl start update-cn-nft.service
```

### 查看更新日志

```bash
journalctl -u update-cn-nft.service -n 100 --no-pager
```

### 查看自动更新时间

```bash
systemctl list-timers update-cn-nft.timer
```

### 查看服务状态

```bash
systemctl status cnfilter.service --no-pager
```

---

## 18. 恢复/删除

如果需要暂时删除限制：

```bash
nft delete table ip cnfilter
```

如果需要关闭开机自动加载：

```bash
systemctl disable cnfilter.service
```

关闭自动更新：

```bash
systemctl disable --now update-cn-nft.timer
```

删除 systemd 配置后：

```bash
rm -f /etc/systemd/system/cnfilter.service
rm -f /etc/systemd/system/update-cn-nft.service
rm -f /etc/systemd/system/update-cn-nft.timer

systemctl daemon-reload
```

---

## 19. 最终结构

```text
/usr/local/sbin/update-cn-nft.sh
        │
        │ 每天自动执行
        ▼
IPdeny 中国大陆 IPv4 CIDR
        │
        ▼
/tmp/cnfilter.nft
        │
        ├── nft -c 语法检查
        │
        ▼
table ip cnfilter
        │
        ├── 中国大陆 TCP 10000-65535 → ACCEPT
        ├── 中国大陆 UDP 10000-65535 → ACCEPT
        ├── 其他 TCP 10000-65535     → DROP
        └── 其他 UDP 10000-65535     → DROP
```

### 注意事项

1. **不要执行 `nft flush ruleset`**，否则可能清除 Docker 的 nftables/iptables-nft 规则。
2. 不要直接修改 Docker 管理的 `table ip nat` 和 `table ip filter`。
3. 修改防火墙前，确保 SSH 会话保持打开，避免误配置导致失联。
4. 当前方案只处理 IPv4。
5. 中国大陆 IP 数据需要定期更新，因此必须启用 `update-cn-nft.timer`。
6. `10000-65535` 是一个很大的端口范围，只有真正监听的端口才会产生实际服务风险。
