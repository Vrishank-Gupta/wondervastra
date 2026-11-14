/**
 * Look-only preview deployments (e.g. a temporary Netlify link to share for feedback).
 * Browsing works from a read-only catalogue snapshot; ordering and the seller admin are switched off,
 * and search engines are asked to stay away.
 */
export function previewMode() {
  return process.env.PREVIEW_MODE === "1";
}
export const PREVIEW_MESSAGE = "This is a preview of WonderVastra. Ordering opens soon.";
