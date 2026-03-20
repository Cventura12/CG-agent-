import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Nav } from './components/Nav'
import Home from './pages/Home'
import HowItWorks from './pages/HowItWorks'
import Product from './pages/Product'
import BookDemo from './pages/BookDemo'

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--body)', overflowX: 'clip' }}>
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/product" element={<Product />} />
          <Route path="/book-demo" element={<BookDemo />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
