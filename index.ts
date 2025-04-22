import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";

// 🔐 SSH Key
const sshKey = new digitalocean.SshKey("ziti-key", {
    name: "ziti-key",
    publicKey: "<your-ssh-public-key>",
});

// 🔥 Firewall (Only 22 + 443 open)
const firewall = new digitalocean.Firewall("ziti-fw", {
    dropletIds: [],
    inboundRules: [
        { protocol: "tcp", portRange: "22", sourceAddresses: ["0.0.0.0/0"] },
        { protocol: "tcp", portRange: "443", sourceAddresses: ["0.0.0.0/0"] },
    ],
    outboundRules: [
        { protocol: "tcp", portRange: "all", destinationAddresses: ["0.0.0.0/0"] },
    ],
    name: "ziti-firewall",
});

// 🧠 Controller Droplet
const controller = new digitalocean.Droplet("ziti-controller", {
    image: "ubuntu-22-04-x64",
    region: "nyc3",
    size: "s-1vcpu-1gb",
    sshKeys: [sshKey.fingerprint],
    userData: `#!/bin/bash
apt update
apt install -y docker.io docker-compose git
git clone https://github.com/openziti/ziti-console-packager /opt/ziti
cd /opt/ziti
docker-compose up -d
`, // ⬅️ Customize to your Ziti docker setup
    tags: ["ziti"],
});

firewall.dropletIds.apply(ids => ids.push(controller.id));

// 🌐 Public Edge Router Droplet
const edgeRouter = new digitalocean.Droplet("ziti-edge-router", {
    image: "ubuntu-22-04-x64",
    region: "nyc3",
    size: "s-1vcpu-1gb",
    sshKeys: [sshKey.fingerprint],
    userData: `#!/bin/bash
apt update
apt install -y docker.io docker-compose git
git clone https://github.com/openziti/ziti-edge-tunnel /opt/ziti-router
cd /opt/ziti-router
# Replace this with your edge router config
`, // customize this
    tags: ["ziti"],
});

firewall.dropletIds.apply(ids => ids.push(edgeRouter.id));

const domain = new digitalocean.Domain("zitinet", {
  name: "zitinet.io",
});

const dnsRecord = new digitalocean.DnsRecord("controller-record", {
  domain: domain.name,
  type: "A",
  name: "controller",
  value: controller.ipv4Address,
});


// 🌍 Export IPs
export const controllerIp = controller.ipv4Address;
export const edgeRouterIp = edgeRouter.ipv4Address;
