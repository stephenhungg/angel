// twitter card uses the same render as opengraph — re-export the default
// so we don't double-maintain. next.js auto-wires both /opengraph-image
// and /twitter-image meta tags.

export { default, runtime, alt, size, contentType } from "./opengraph-image";
