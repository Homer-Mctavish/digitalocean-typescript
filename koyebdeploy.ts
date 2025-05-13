import * as pulumi from "@pulumi/pulumi";
import * as koyeb from "@koyeb/pulumi-koyeb";

// Koyeb API token must be set in KOYEB_TOKEN env var
// pulumi config set --secret koyebJwt <your‐jwt>
const cfg    = new pulumi.Config();
const jwt    = cfg.requireSecret("koyebJwt");      // your Koyeb API JWT
const orgId  = cfg.require("koyebOrgId");          // your Koyeb organization ID

// 1) Instantiate the provider with your org ID
const koyebProvider = new koyeb.Provider("koyeb-provider", {
  token:         jwt,
  organizationId: orgId,
});

// 2) CONTROLLER APP & SERVICE
const controllerApp = new koyeb.App("ziti-controller-app", {
    name: "ziti-controller",
}, { provider: koyebProvider });

const edgeApp = new koyeb.App("ziti-edge-router-app", {
    name: "ziti-edge-router",
}, { provider: koyebProvider });


const controllerService = new koyeb.Service("ziti-controller-svc", {
    appName: controllerApp.name,
    definition: {
        name: "ziti-controller",
        regions: ["sfo"],                        // choose your region
        image: "openziti/quickstart:latest",     // all‑in‑one quickstart
        env: [
            { name: "ZITI_USER",  value: "admin" },
            { name: "ZITI_PWD",   value: zitiPwd, secret: false },
        ],
        instanceTypes: { type: "micro" },        // smallest instance
        ports: [
            { port: 1280, protocol: "tcp" },     // controller API
            { port: 6262, protocol: "tcp" },     // controller internal
        ],
        scalings: { min: 1, max: 1 },
    },
});


const edgeService = new koyeb.Service("ziti-edge-router-svc", {
    appName: edgeApp.name,
    definition: {
        name: "ziti-edge-router",
        regions: ["sfo"],
        image: "openziti/quickstart:latest",
        env: [
            // point at your controller service:
            { name: "ZITI_CTRL_EDGE_ADVERTISED_ADDRESS", value: controllerService.url.apply(u => new URL(u).hostname) },
            { name: "ZITI_CTRL_EDGE_ADVERTISED_PORT",    value: "1280" },
            // router settings
            { name: "ZITI_ROUTER_NAME",          value: "edge-router" },
            { name: "ZITI_ROUTER_ADVERTISED_PORT", value: "3022" },
        ],
        instanceTypes: { type: "micro" },
        ports: [
            { port: 3022, protocol: "tcp" },    // edge‐router data plane
            { port: 10080, protocol: "tcp" },   // overlay listener
        ],
        scalings: { min: 1, max: 1 },
    },
});

// 3) Export the public URLs so you can enroll peers against them
export const controllerUrl = controllerService.url;
export const edgeRouterUrl = edgeService.url;
