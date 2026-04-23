import CrapsGame from './CrapsGame'
function App() {
  return (
    <>
      <a
        href="https://hub-phi-blush.vercel.app"
        className="fixed top-3 left-3 z-50 text-xs text-white/50 hover:text-white/90 bg-black/40 hover:bg-black/60 px-2.5 py-1.5 rounded-md transition-all"
      >
        ← hub
      </a>
      <CrapsGame />
    </>
  )
}
export default App
