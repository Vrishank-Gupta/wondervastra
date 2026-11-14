import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page renders on request (force-dynamic), so no incremental cache (and no paid R2 bucket) is needed.
export default defineCloudflareConfig({});
