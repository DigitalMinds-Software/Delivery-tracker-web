import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { io } from 'socket.io-client';
import { AppBar, Toolbar, Typography, Container, Snackbar, Button, TextField, Grid } from '@mui/material';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const socket = io('http://localhost:8000', {
  transports: ['websocket', 'polling'],
});

// Custom marker icons
const scooterIcon = new L.Icon({
  iconUrl: 'https://i.ibb.co/YpVYn2Q/delivery.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

const destinationIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

export default function App() {
  const [locations, setLocations] = useState({});
  const [error, setError] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [path, setPath] = useState([]);
  const [startAddress, setStartAddress] = useState('');
  const [endAddress, setEndAddress] = useState('');
  // const [startCoords, setStartCoords] = useState(null);
  const [endCoords, setEndCoords] = useState(null);
  const [departureTime, setDepartureTime] = useState('');
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState('');
  const [deliveryState, setDeliveryState] = useState(null);
  const [stateMessage, setStateMessage] = useState('');
  const mapRef = useRef();

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      setError(null);
    });

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setError(`Connection error: ${error.message}`);
    });

    socket.on('location_updated', (data) => {
      console.log('Received location update:', data);
      setLocations(prev => ({
        ...prev,
        [data.id]: { lat: data.latitude, lng: data.longitude }
      }));
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('location_updated');
    };
  }, []);

  const geocodeAddress = async (address) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await response.json();
      if (data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      }
      throw new Error('Address not found');
    } catch (error) {
      console.error('Geocoding error:', error);
      setError(`Geocoding error: ${error.message}`);
      return null;
    }
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
  };

  const estimateArrivalTime = (startLat, startLng, endLat, endLng, departureTime) => {
    const distance = calculateDistance(startLat, startLng, endLat, endLng);
    const averageSpeed = 10; // km/h, adjust as needed for your use case
    const travelTimeHours = distance / averageSpeed;

    const departure = new Date(`2024-01-01T${departureTime}`);
    const arrival = new Date(departure.getTime() + travelTimeHours * 60 * 60 * 1000);

    return arrival.toTimeString().slice(0, 5); // Returns HH:MM format
  };

  const updateDeliveryState = (currentPosition, endPosition) => {
    const distance = calculateDistance(
      currentPosition[0], currentPosition[1],
      endPosition.lat, endPosition.lng
    );

    if (distance <= 0.1) { // Within 100 meters
      setDeliveryState('ARRIVED');
      setStateMessage('We have reached your destination!');
    } else if (distance <= 3) { // Within 1 km
      setDeliveryState('NEAR TO');
      setStateMessage(`We're ${(distance * 1000).toFixed(0)} m away from your destination.`);
    } else if (deliveryState !== 'STARTED') {
      setDeliveryState('STARTED');
      setStateMessage("We're delivering...");
    }
  };

  const simulateMovement = async () => {
    if (isSimulating) return;
    setIsSimulating(true);

    const start = await geocodeAddress(startAddress);
    const end = await geocodeAddress(endAddress);

    if (!start || !end || !departureTime) {
      setIsSimulating(false);
      setError('Please provide valid addresses and departure time.');
      return;
    }

    // setStartCoords(start);
    setEndCoords(end);

    const estimatedArrival = estimateArrivalTime(
      start.lat, start.lng, end.lat, end.lng, departureTime
    );
    setEstimatedArrivalTime(estimatedArrival);

    const newPath = generatePath(start.lat, start.lng, end.lat, end.lng, 100);
    setPath(newPath);

    setDeliveryState('STARTED');
    setStateMessage("We're delivering...");

    let i = 0;
    const interval = setInterval(() => {
      if (i >= newPath.length) {
        clearInterval(interval);
        setIsSimulating(false);
        return;
      }

      const newLocation = {
        latitude: newPath[i][0],
        longitude: newPath[i][1]
      };
      socket.emit('update_location', newLocation);

      if (mapRef.current) {
        mapRef.current.setView(newPath[i], 13);
      }

      updateDeliveryState(newPath[i], end);

      i++;
    }, 2000); // Update every 100ms
  };

  const generatePath = (startLat, startLng, endLat, endLng, steps) => {
    const path = [];
    for (let i = 0; i <= steps; i++) {
      const lat = startLat + (endLat - startLat) * (i / steps);
      const lng = startLng + (endLng - startLng) * (i / steps);
      path.push([lat, lng]);
    }
    return path;
  };

  return (
    <div>
      <AppBar position="static">
        <Toolbar variant='dense'>
          <Typography variant="h6" fontSize={18} fontWeight={'bold'}>
            Delivery Tracker
          </Typography>
        </Toolbar>
      </AppBar>
      <Container style={{ marginTop: '20px' }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Starting Address"
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Delivery Address"
              value={endAddress}
              onChange={(e) => setEndAddress(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Departure Time"
              type="time"
              value={departureTime}
              onChange={(e) => setDepartureTime(e.target.value)}
              InputLabelProps={{
                shrink: true,
              }}
              inputProps={{
                step: 300, // 5 min
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body1">
              Estimated Arrival Time: {estimatedArrivalTime || '_'}
            </Typography>
          </Grid>
          <Grid item xs={12} display={'flex'} justifyContent={'end'}>
            <Button
              variant="contained"
              color="primary"
              onClick={simulateMovement}
              disabled={isSimulating || !startAddress || !endAddress}
            >
              {isSimulating ? 'Simulating...' : 'Start Simulation'}
            </Button>
          </Grid>
        </Grid>
        <MapContainer
          center={[0, 0]}
          zoom={2}
          style={{ height: '500px', marginTop: '20px' }}
          ref={mapRef}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {Object.entries(locations).map(([id, position]) => (
            <Marker key={id} position={position} icon={scooterIcon}>
              <Popup>Delivery Person</Popup>
            </Marker>
          ))}
          {endCoords && (
            <Marker position={endCoords} icon={destinationIcon}>
              <Popup>Delivery Destination</Popup>
            </Marker>
          )}
          {path.length > 0 && (
            <Polyline positions={path} color="blue" />
          )}
        </MapContainer>
      </Container>
      <Snackbar
        open={!!error}
        message={error || ''}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      />
      <Snackbar
        open={!!deliveryState}
        message={stateMessage}
        autoHideDuration={6000}
        onClose={() => setDeliveryState(null)}
      />
    </div>
  );
}