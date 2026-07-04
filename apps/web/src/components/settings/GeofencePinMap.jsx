'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';

const KENYA_CENTER = { lat: -0.0236, lng: 37.9062 };
const KENYA_LEAFLET_CENTER = [-0.0236, 37.9062];
const GOOGLE_MAPS_SCRIPT_ID = 'diraschool-google-maps-js';
const GOOGLE_MAPS_CALLBACK = '__diraschoolInitGoogleMaps';
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function loadGoogleMaps() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in the browser.'));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return Promise.reject(new Error('missing-google-maps-key'));
  }

  if (window.__diraschoolGoogleMapsPromise) {
    return window.__diraschoolGoogleMapsPromise;
  }

  window.__diraschoolGoogleMapsPromise = new Promise((resolve, reject) => {
    window[GOOGLE_MAPS_CALLBACK] = () => resolve(window.google.maps);

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) return;

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&v=weekly&callback=${GOOGLE_MAPS_CALLBACK}`;
    script.onerror = () => reject(new Error('google-maps-load-failed'));
    document.head.appendChild(script);
  });

  return window.__diraschoolGoogleMapsPromise;
}

function LeafletMapClickHandler({ canEdit, onChange }) {
  useMapEvents({
    click(event) {
      if (!canEdit) return;
      onChange({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
      });
    },
  });

  return null;
}

function LeafletRecenterMap({ position }) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.setView(position, Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [map, position?.[0], position?.[1]]);

  return null;
}

function LeafletFallbackMap({ latitude, longitude, radius, canEdit, onChange }) {
  const hasPosition = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const position = hasPosition ? [Number(latitude), Number(longitude)] : null;
  const center = position ?? KENYA_LEAFLET_CENTER;
  const zoom = position ? 17 : 6;
  const radiusMeters = Number(radius) || 150;

  const markerIcon = useMemo(
    () =>
      L.divIcon({
        className: '',
        html: '<div style="width:22px;height:22px;border-radius:999px;background:#0e7490;border:3px solid white;box-shadow:0 8px 18px rgba(15,23,42,.28);"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    []
  );

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LeafletMapClickHandler canEdit={canEdit} onChange={onChange} />
      {position && (
        <>
          <LeafletRecenterMap position={position} />
          <Circle
            center={position}
            radius={radiusMeters}
            pathOptions={{
              color: '#0e7490',
              fillColor: '#06b6d4',
              fillOpacity: 0.16,
              weight: 2,
            }}
          />
          <Marker
            position={position}
            icon={markerIcon}
            draggable={canEdit}
            eventHandlers={{
              dragend(event) {
                const point = event.target.getLatLng();
                onChange({ latitude: point.lat, longitude: point.lng });
              },
            }}
          />
        </>
      )}
    </MapContainer>
  );
}

export function GeofencePinMap({ latitude, longitude, radius, canEdit, onChange }) {
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const circleRef = useRef(null);
  const listenersRef = useRef([]);
  const canEditRef = useRef(canEdit);
  const onChangeRef = useRef(onChange);
  const [loadState, setLoadState] = useState(GOOGLE_MAPS_API_KEY ? 'loading' : 'missing-key');

  const hasPosition = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const position = useMemo(
    () => (hasPosition ? { lat: Number(latitude), lng: Number(longitude) } : null),
    [hasPosition, latitude, longitude]
  );
  const radiusMeters = Number(radius) || 150;

  useEffect(() => {
    canEditRef.current = canEdit;
    onChangeRef.current = onChange;
  }, [canEdit, onChange]);

  useEffect(() => {
    let mounted = true;

    loadGoogleMaps()
      .then((maps) => {
        if (!mounted || !mapNodeRef.current || mapRef.current) return;

        mapRef.current = new maps.Map(mapNodeRef.current, {
          center: position ?? KENYA_CENTER,
          zoom: position ? 17 : 6,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });

        listenersRef.current.push(
          mapRef.current.addListener('click', (event) => {
            if (!canEditRef.current || !event.latLng) return;
            onChangeRef.current({
              latitude: event.latLng.lat(),
              longitude: event.latLng.lng(),
            });
          })
        );

        setLoadState('ready');
      })
      .catch((error) => {
        if (!mounted) return;
        setLoadState(error.message === 'missing-google-maps-key' ? 'missing-key' : 'failed');
      });

    return () => {
      mounted = false;
      listenersRef.current.forEach((listener) => listener.remove());
      listenersRef.current = [];
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const maps = window.google?.maps;
    const map = mapRef.current;
    if (!maps || !map || loadState !== 'ready') return;

    if (!position) {
      markerRef.current?.setMap(null);
      circleRef.current?.setMap(null);
      markerRef.current = null;
      circleRef.current = null;
      map.setCenter(KENYA_CENTER);
      map.setZoom(6);
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new maps.Marker({
        map,
        position,
        draggable: canEdit,
        title: 'School check-in pin',
        icon: {
          path: maps.SymbolPath.CIRCLE,
          fillColor: '#0e7490',
          fillOpacity: 1,
          scale: 9,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });

      listenersRef.current.push(
        markerRef.current.addListener('dragend', (event) => {
          if (!canEditRef.current || !event.latLng) return;
          onChangeRef.current({
            latitude: event.latLng.lat(),
            longitude: event.latLng.lng(),
          });
        })
      );
    } else {
      markerRef.current.setPosition(position);
      markerRef.current.setMap(map);
    }

    markerRef.current.setDraggable(Boolean(canEdit));

    if (!circleRef.current) {
      circleRef.current = new maps.Circle({
        map,
        center: position,
        radius: radiusMeters,
        strokeColor: '#0e7490',
        strokeOpacity: 1,
        strokeWeight: 2,
        fillColor: '#06b6d4',
        fillOpacity: 0.16,
      });
    } else {
      circleRef.current.setOptions({
        center: position,
        radius: radiusMeters,
        map,
      });
    }

    map.panTo(position);
    if (map.getZoom() < 16) map.setZoom(17);
  }, [canEdit, loadState, position, radiusMeters]);

  if (loadState === 'missing-key') {
    return (
      <LeafletFallbackMap
        latitude={latitude}
        longitude={longitude}
        radius={radius}
        canEdit={canEdit}
        onChange={onChange}
      />
    );
  }

  if (loadState === 'failed') {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/30 p-4 text-center">
        <div className="max-w-sm space-y-1">
          <p className="text-sm font-medium text-foreground">Map could not be loaded.</p>
          <p className="text-xs text-muted-foreground">
            Check that the Google Maps JavaScript API is enabled for your API key.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapNodeRef} className="h-full w-full" />
      {loadState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-muted-foreground">
          Loading map...
        </div>
      )}
    </div>
  );
}
