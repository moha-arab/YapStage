/// <reference types="vite/client" />

/** Short git SHA of the CLIENT build, injected by vite.config.ts. Lets a phone
    report which bundle it is actually running — /healthz only knows the server. */
declare const __BUILD__: string;
