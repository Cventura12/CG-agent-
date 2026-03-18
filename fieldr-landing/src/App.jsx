import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import Product from './pages/Product'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--body)' }}>
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/product" element={<Product />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
