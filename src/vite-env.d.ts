/// <reference types="vite/client" />
interface ImportMetaEnv {
    readonly PACKAGE_VERSION: string;
    /** IANA timezone the studio schedules in, e.g. America/Los_Angeles. Optional. */
    readonly VITE_STUDIO_TIME_ZONE?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
