import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AmbientBackground } from './components/AmbientBackground'
import { Nav } from './components/Nav'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import Product from './pages/Product'
import BookDemo from './pages/BookDemo'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ position: 'relative', minHeight: '100vh', isolation: 'isolate', background: 'var(--bg)', color: 'var(--body)', overflowX: 'clip' }}>
        <AmbientBackground />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Nav />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/how-it-works" element={<HowItWorks />} />
            <Route path="/product" element={<Product />} />
            <Route path="/book-demo" element={<BookDemo />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  )
}
