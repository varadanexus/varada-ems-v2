# Varada EMS module integration

Nexus Social is registered as the protected EMS module
`social-media-manager`. The EMS launcher lives at:

`/new-ems/modules/social-media-manager/index.html`

The Next.js application remains independently buildable and deployable. EMS
embeds its dashboard using `EMS_RUNTIME_CONFIG.socialMediaManagerUrl`. This
keeps AI generation and publishing dependencies isolated from the static EMS
shell while preserving one command-center entry point and one permission
catalogue.

## Local development

1. Serve the EMS repository on `http://localhost:5501` or a loopback
   `127.0.0.1` address.
2. Start this application on `http://localhost:3000`.
3. Open the Nexus Social card in the EMS Command Center.

## Production routing

Recommended production topology:

```text
/new-ems/*       -> existing EMS static application
/social-media/*  -> Nexus Social Next.js service
```

Set `socialMediaManagerUrl` in `new-ems/config/runtime.js` to the deployed
dashboard route. Set `EMS_PARENT_ORIGIN` to the exact EMS origin so the
application's `frame-ancestors` policy permits only the trusted EMS host.

## Access control

EMS verifies the `social-media-manager` view permission before rendering the
launcher. The database migration seeds permission grants for CMD, Super Admin,
Admin, Manager and Operator roles. Nexus Social continues to enforce its own
fine-grained content workflow roles inside the module.

No authentication token is placed in the URL or sent with `postMessage`.
Production should use the same Supabase project and a same-site reverse proxy
for seamless cookie-based session sharing.
