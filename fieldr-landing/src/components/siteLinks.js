const demoUrl = import.meta.env.VITE_BOOK_DEMO_URL?.trim()
const appUrl = import.meta.env.VITE_AGENT_APP_URL?.trim()
const demoFormEndpoint = import.meta.env.VITE_BOOK_DEMO_FORM_ENDPOINT?.trim()

export const BOOK_DEMO_HREF = demoUrl || '/book-demo'
export const BOOK_DEMO_FORM_ENDPOINT = demoFormEndpoint || ''

export const APP_FLOW_HREF = appUrl || 'https://cg-agent-six.vercel.app/'
