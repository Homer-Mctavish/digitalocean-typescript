import * as pulumi from "@pulumi/pulumi";
import * as digitalocean from "@pulumi/digitalocean";

const config = new pulumi.Config();
const publicKey = config.requireSecret("publicSshKey");

const project = digitalocean.getProject({
  name: "OpenZiti-Cloud-Overhead",
});



// 🔐 SSH Key
const sshKey = new digitalocean.SshKey("ziti-key", {
    name: "ziti-key",
    publicKey: publicKey,
});

// 🌐 Public Edge Router Droplet
const edgeRouter = new digitalocean.Droplet("ziti-edge-router", {
  image: "ubuntu-22-04-x64",
  region: "nyc3",
  size: "s-1vcpu-1gb",
  sshKeys: [sshKey.fingerprint],
  userData: `#!/bin/bash
# Update and install necessary packages
apt-get update && apt-get install -y docker.io wget

# Create a directory for the Ziti router
mkdir -p /opt/ziti-router
cd /opt/ziti-router

# Download the Docker Compose file for the Ziti router
wget https://get.openziti.io/dist/docker-images/ziti-router/compose.yml

# Set environment variables for Docker Compose
export ZITI_ENROLL_TOKEN="<your-enrollment-token>"
export ZITI_CTRL_ADVERTISED_ADDRESS="<your-controller-address>"
export ZITI_CTRL_ADVERTISED_PORT=1280
export ZITI_ROUTER_ADVERTISED_ADDRESS="<your-router-address>"
export ZITI_ROUTER_PORT=3022

# Start the Ziti router using Docker Compose
docker compose up -d
`, // customize this
  tags: ["ziti-router"],
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
# fetch the compose file for the ziti-router image
wget https://get.openziti.io/dist/docker-images/ziti-controller/compose.yml

export ZITI_PWD="mypass" \
export ZITI_CTRL_ADVERTISED_ADDRESS=ctrl.127.21.71.0.sslip.io \
  docker compose up -d
`, // ⬅️ Customize to your Ziti docker setup
  tags: ["ziti-controller"],
});

const firewall = new digitalocean.Firewall("ziti-firewall", {
  name: "ziti-firewall",
  inboundRules: [
      { protocol: "tcp", portRange: "22", sourceAddresses: ["0.0.0.0/0"] },
      { protocol: "tcp", portRange: "443", sourceAddresses: ["0.0.0.0/0"] },
  ],
  outboundRules: [
      { protocol: "tcp", portRange: "all", destinationAddresses: ["0.0.0.0/0"] },
  ],
  dropletIds: pulumi.all([controller.id, edgeRouter.id]).apply(([controllerId, edgeId]) => {
      return [parseInt(controllerId), parseInt(edgeId)];
  }),
});


// ✅ Convert resource IDs into DigitalOcean-formatted resource strings
const resourceIds = pulumi
  .all([controller.id, edgeRouter.id, firewall.id])
  .apply(([controllerId]) => [
    `do:droplet:${controllerId}`,
    `do:droplet:${edgeRouter.id}`,
    `do:firewall:${firewall.id}`,
    // add other DO-formatted resource strings here as needed
  ]);

// const domain = new digitalocean.Domain("zitinet", {
//   name: "zitinet.io",
// });

// const dnsRecord = new digitalocean.DnsRecord("controller-record", {
//   domain: domain.name,
//   type: "A",
//   name: "controller",
//   value: controller.ipv4Address,
// });

new digitalocean.ProjectResources("ziti-project-binding", {
  project: project.then(p => p.id),
  resources: resourceIds,
});



// 🌍 Export IPs
export const controllerIp = controller.ipv4Address;
export const edgeRouterIp = edgeRouter.ipv4Address;
