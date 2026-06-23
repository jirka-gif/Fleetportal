import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import FleetPortal from './FleetPortal.jsx'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FleetPortal />
  </React.StrictMode>
)
