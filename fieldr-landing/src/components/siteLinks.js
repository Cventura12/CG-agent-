const demoUrl = import.meta.env.VITE_BOOK_DEMO_URL?.trim()
const appUrl = import.meta.env.VITE_AGENT_APP_URL?.trim()

export const BOOK_DEMO_HREF =
  demoUrl || 'mailto:calebventura845@gmail.com?subject=Fieldr%20Demo%20Request&body=I%27d%20like%20to%20book%20a%20demo%20for%20Fieldr.'

export const APP_FLOW_HREF = appUrl || 'https://cg-agent-six.vercel.app/'
