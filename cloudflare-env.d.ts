declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
declare namespace Cloudflare { interface Env { BETTER_AUTH_SECRET?: string; APP_ORIGIN?: string; } }
