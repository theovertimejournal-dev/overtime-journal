import { BrowserRouter, Routes, Route } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#08080f] text-gray-200 font-mono">
        <nav className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏀</span>
            <h1 className="text-xl font-bold tracking-tight">OTJ</h1>
            <span className="text-xs text-gray-600">The Overtime Journal</span>
          </div>
          <div className="flex gap-4 text-sm text-gray-500">
            <a href="/" className="hover:text-white transition">NBA</a>
            <span className="text-gray-700">NHL</span>
            <span className="text-gray-700">MLB</span>
            <span className="text-gray-700">NFL</span>
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

function Home() {
  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold">Tonight's Edge</h2>
        <span className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 font-semibold">LIVE</span>
      </div>
      <div className="border border-white/5 rounded-xl p-6 bg-white/[0.02]">
        <p className="text-gray-400">OTJ is live. Dashboard coming next.</p>
      </div>
    </div>
  )
}

export default App
