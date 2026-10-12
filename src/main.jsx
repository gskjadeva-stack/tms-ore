import React from 'react'
import ReactDOM from 'react-dom/client'
import '@/api/client' // must be FIRST: sets globalThis.__B44_DB__ before the legacy stub lines in pages evaluate
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
