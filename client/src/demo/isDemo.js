// True only in the GitHub Pages demo build (see .github/workflows/demo.yml), where there's no
// server - services/api.js routes every request to the in-browser mock in demo/mockApi.js instead.
export const IS_DEMO = process.env.REACT_APP_DEMO === 'true';

export const DEMO_DISABLED_MESSAGE = 'This feature is not available in the demo.';
