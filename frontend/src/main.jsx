import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Excalidraw looks here for its fonts. It is imported lazily — only once
// somebody walks up to the whiteboard — so setting this at startup is well
// ahead of anything that reads it, and the board never reaches out to a CDN
// mid-session.
window.EXCALIDRAW_ASSET_PATH = "/excalidraw/";

createRoot(document.getElementById('root')).render(<App />)
