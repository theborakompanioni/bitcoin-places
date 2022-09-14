import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Marker,
  Popup,
  Rectangle,
} from 'react-leaflet'
import Map, { PanToMapCenter, MapOnClick } from './map/Map'
import Minimap from './map/Minimap'
import DraggableMarker from './map/DraggableMarker'

import { fetchBlockHashByHeight, fetchBlockTipHeight, geohash, LatLng, throwError } from './utils'

import 'leaflet/dist/leaflet.css'
import './App.css'
import useNavigatorGeolocation from './hooks/useNavigatorGeolocation'

const AUSTIN: LatLng = [30.375115, -97.687444]
const DEFAULT_LOCATION = AUSTIN

const BLOCKS_PER_DAY = 6 * 24
const BLOCKS_PER_WEEK = BLOCKS_PER_DAY * 7

const BLOCKHEIGHT_TO_HASH_MAP: { [key: number]: string } = {
  0: '000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f',
}

function App() {
  const { browserCurrentPositionError, browserCurrentPosition } = useNavigatorGeolocation()
  const [myPosition, setMyPosition] = useState<LatLng | undefined>(undefined)

  const myPositionMarker = useMemo(() => {
    if (!myPosition) return

    return (
      <DraggableMarker
        position={myPosition}
        onDragEnd={(marker) => {
          const latLng = marker.getLatLng()
          setMyPosition([latLng.lat, latLng.lng])
        }}
      >
        <Popup>
          You ({myPosition[0]}, {myPosition[1]})
        </Popup>
      </DraggableMarker>
    )
  }, [myPosition])

  useEffect(() => {
    if (!browserCurrentPosition) return

    const latLng: LatLng = [browserCurrentPosition.coords.latitude, browserCurrentPosition.coords.longitude]
    setMyPosition(latLng)
  }, [browserCurrentPosition])

  useEffect(() => {
    if (myPosition) return

    if (browserCurrentPositionError) {
      setMyPosition(DEFAULT_LOCATION)
    }
  }, [myPosition, browserCurrentPositionError])

  useEffect(() => {
    if (!myPosition) return

    const msg = ['Your position changed to:', `${myPosition}`].join('\n')
    console.info(msg)
  }, [myPosition])

  const rectangleOptions = useMemo(() => {
    if (!myPosition) return []

    const x = Math.floor(myPosition[0])
    const y = Math.floor(myPosition[1])

    const rects = []
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const isActive = i === 0 && j === 0
        const pathOptions = {
          color: isActive ? 'green' : 'black',
          opacity: isActive ? 1 : 0.1,
          fillOpacity: 0.1,
        }
        rects.push({
          bounds: [[x - i, y - j] as LatLng, [x - i + 1, y - j + 1] as LatLng],
          pathOptions,
        })
      }
    }
    return rects
  }, [myPosition])

  const [loading, setLoading] = useState(true)
  const [blockTipHeight, setBlockTipHeight] = useState<number | null>(null)
  const [blockHeight, setBlockHeight] = useState(0)
  const [blockHash, setBlockHash] = useState<string | null>(null)

  const [blockHeightInput, setBlockHeightInput] = useState(blockHeight)

  useEffect(() => {
    const timerId = setTimeout(() => {
      setBlockHeight(blockHeightInput)
    }, 1_000)

    return () => clearTimeout(timerId)
  }, [blockHeightInput])

  const geohashPosition = useMemo(() => {
    if (!blockHash) return
    if (!myPosition) return
    return geohash(blockHash, myPosition)
  }, [blockHash, myPosition])

  const geohashPositionMarker = useMemo(() => {
    if (!geohashPosition) return

    return (
      <Marker position={geohashPosition}>
        <Popup>
          {blockHash} ({geohashPosition[0]}, {geohashPosition[1]})
        </Popup>
      </Marker>
    )
  }, [blockHash, geohashPosition])

  const blockHeightOfTheDay = useMemo(() => {
    if (blockTipHeight === null) return null
    return blockTipHeight - (blockTipHeight % BLOCKS_PER_DAY) - BLOCKS_PER_DAY
  }, [blockTipHeight])

  const blockHeightOfTheWeek = useMemo(() => {
    if (blockTipHeight === null) return null
    return blockTipHeight - (blockTipHeight % BLOCKS_PER_WEEK) - BLOCKS_PER_WEEK
  }, [blockTipHeight])

  const onClickCurrent = useCallback(() => {
    if (blockTipHeight === null) return
    setBlockHeightInput(blockTipHeight)
  }, [blockTipHeight])

  const onClickToday = useCallback(() => {
    if (blockHeightOfTheDay === null) return
    setBlockHeightInput(blockHeightOfTheDay)
  }, [blockHeightOfTheDay])

  const onClickWeek = useCallback(() => {
    if (blockHeightOfTheWeek === null) return
    setBlockHeightInput(blockHeightOfTheWeek)
  }, [blockHeightOfTheWeek])

  const onClickGenesis = useCallback(() => {
    setBlockHeightInput(0)
  }, [])

  useEffect(() => {
    const abortCtrl = new AbortController()

    setLoading(true)
    fetchBlockTipHeight({ signal: abortCtrl.signal })
      .then((val) => new Promise<Response>((resolve) => setTimeout(() => resolve(val), 250)))
      .then((res) => (res.ok ? res.text() : throwError('')))
      .then((data) => {
        if (abortCtrl.signal.aborted) return
        setBlockTipHeight(parseInt(data, 10))
      })
      .catch((e) => console.log(e))
      .finally(() => setLoading(false))

    return () => {
      abortCtrl.abort()
    }
  }, [])

  useEffect(() => {
    if (BLOCKHEIGHT_TO_HASH_MAP[blockHeight]) {
      setBlockHash(BLOCKHEIGHT_TO_HASH_MAP[blockHeight])
      return
    }

    const abortCtrl = new AbortController()
    const height = blockHeight

    setLoading(true)
    fetchBlockHashByHeight(height, { signal: abortCtrl.signal })
      .then((val) => new Promise<Response>((resolve) => setTimeout(() => resolve(val), 250)))
      .then((res) => (res.ok ? res.text() : throwError('')))
      .then((hash) => {
        if (abortCtrl.signal.aborted) return
        BLOCKHEIGHT_TO_HASH_MAP[height] = hash
        setBlockHash(hash)
      })
      .catch((e) => console.log(e))
      .finally(() => setLoading(false))

    return () => {
      abortCtrl.abort()
    }
  }, [blockHeight])

  return (
    <>
      <a href="https://github.com/theborakompanioni/bitcoin-places" rel="noopener noreferrer">
        <img alt="Fork me on GitHub" title="Fork me on GitHub" src="fork_me.png" id="forkme" />
      </a>
      <div className="App">
        <header className="App-container" style={{ backgroundColor: 'rgba(0, 0, 0, 0.33)' }}>
          <h1>
            Bitcoin Places
            <div className="mt-1 text-small">Most recent block height: {blockTipHeight}</div>
          </h1>
          <div>
            <ul className="m-0 p-0 unstyled vertical">
              <li>
                <button onClick={onClickCurrent} disabled={loading}>
                  Current {blockTipHeight}
                </button>
              </li>
              <li>
                <button onClick={onClickToday} disabled={loading}>
                  Today {blockHeightOfTheDay}
                </button>
              </li>
              <li>
                <button onClick={onClickWeek} disabled={loading}>
                  Week {blockHeightOfTheWeek}
                </button>
              </li>
              <li>
                <button onClick={onClickGenesis} disabled={loading}>
                  Genesis 0
                </button>
              </li>
            </ul>
          </div>
          <div className="mt-1">
            <input
              name="blockHeightInput"
              type="number"
              step={1}
              min={0}
              max={blockTipHeight || 0}
              value={blockHeightInput}
              onChange={(e) => {
                e.preventDefault()
                e.stopPropagation()

                if (loading) return
                setBlockHeightInput(parseInt(e.target.value, 10))
              }}
            />
          </div>
          <div className="mt-1">{blockHash}</div>
          <div className="mt-1 d-none">My Position: {JSON.stringify(myPosition, null, 2)}</div>
        </header>

        <div style={{ width: '100vw', height: `100vh`, position: 'absolute', left: 0, top: 0, zIndex: -1 }}>
          <Map>
            <>
            <Minimap position="bottomright" />
              {geohashPositionMarker}
              {myPositionMarker}

              <PanToMapCenter center={geohashPosition} />
              <MapOnClick
                onClick={(e) => {
                  const latLng = e.latlng
                  setMyPosition([latLng.lat, latLng.lng])
                }}
              />
              {rectangleOptions.map((options, index) => {
                return <Rectangle key={index} bounds={options.bounds} pathOptions={options.pathOptions} />
              })}
            </>
          </Map>
        </div>
      </div>
    </>
  )
}

export default App
