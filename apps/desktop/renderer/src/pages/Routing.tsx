import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../contexts/AuthContext'
import { useDatabase } from '../hooks/useDatabase'
import { getSystemConfig } from '../utils/systemConfig'
import { MapPin } from 'lucide-react'
import { logger } from '@dios/shared'
import type { Operation } from '@dios/shared'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'

// Fix Leaflet default marker icons for Vite bundler
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).href,
})

export default function Routing() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { findAll } = useDatabase<Operation>({ table: 'operations' })
  const [operations, setOperations] = useState<Operation[]>([])
  const [homebase, setHomebase] = useState<[number, number] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    const load = async () => {
      try {
        const [ops, config] = await Promise.all([
          findAll(),
          getSystemConfig(user.uid),
        ])
        setOperations(ops.filter((op) => op.lat != null && op.lng != null))

        const lat = config.homebaseLat as number | undefined
        const lng = config.homebaseLng as number | undefined
        if (lat && lng) setHomebase([lat, lng])
      } catch (err) {
        logger.error('Failed to load map data:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [user, findAll])

  // Center on homebase, fallback to US center
  const center: [number, number] = homebase ?? [43.8014, -91.2396]

  if (loading) {
    return (
      <div className="animate-in fade-in duration-500 p-8 text-center text-[#8b7355]">
        Loading map...
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 luxury-card rounded-2xl flex items-center justify-center">
            <MapPin size={24} className="text-[#d4a574]" />
          </div>
          <div>
            <h1 className="font-serif-display text-[36px] font-semibold text-[#2a2420] tracking-tight">Map</h1>
            <p className="text-[#8b7355] text-sm font-medium mt-1">
              {operations.length} operator{operations.length !== 1 ? 's' : ''} with locations
            </p>
          </div>
        </div>
      </div>

      <div className="luxury-card rounded-[24px] overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
        <MapContainer
          center={center}
          zoom={operations.length === 0 ? 5 : operations.length === 1 ? 10 : 6}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {homebase && (
            <Marker
              position={homebase}
              icon={L.divIcon({
                className: '',
                html: '<div style="width:14px;height:14px;border-radius:50%;background:#d4a574;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3)"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7],
              })}
            >
              <Popup><strong>Your homebase</strong></Popup>
            </Marker>
          )}
          {operations.map((op) => (
            <Marker key={op.id} position={[op.lat!, op.lng!]}>
              <Popup>
                <div style={{ minWidth: 160 }}>
                  <strong style={{ fontSize: 14 }}>{op.name}</strong>
                  {op.address && (
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{op.address}</div>
                  )}
                  {op.operationType && (
                    <div style={{ fontSize: 11, color: '#999', marginTop: 2, textTransform: 'capitalize' }}>
                      {op.operationType}
                    </div>
                  )}
                  <button
                    onClick={() => navigate(`/operations/${op.id}`)}
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: '#d4a574',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      fontWeight: 600,
                    }}
                  >
                    View operator →
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
