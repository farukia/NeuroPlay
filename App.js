import React, { useState, useRef } from 'react';
import {
  View,
  Button,
  Image,
  StyleSheet,
  Dimensions,
  PanResponder,
  Text,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TouchableOpacity } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [started, setStarted] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [paths, setPaths] = useState([]);
  const [lastStroke, setLastStroke] = useState(null);
  const currentStrokeRef = useRef([]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY, force } = evt.nativeEvent;
        currentStrokeRef.current = [
          {
            x: locationX,
            y: locationY,
            pressure: force || 1,
            timestamp: Date.now(),
          },
        ];
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY, force } = evt.nativeEvent;
        currentStrokeRef.current.push({
          x: locationX,
          y: locationY,
          pressure: force || 1,
          timestamp: Date.now(),
        });
        setPaths((p) => [...p]);
      },
      onPanResponderRelease: () => {
        setPaths((prevPaths) => {
          const newPaths = [...prevPaths, currentStrokeRef.current];
          setLastStroke(currentStrokeRef.current);
          currentStrokeRef.current = [];
          return newPaths;
        });
      },
    })
  ).current;

  const pointsToSvgPath = (points) => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => (i === 0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`))
      .join(' ');
  };

  const handleStart = () => {
    setStarted(true);
    setShowImage(true);
    setPaths([]);
    setLastStroke(null);
    currentStrokeRef.current = [];

    setTimeout(() => {
      setShowImage(false);
    }, 2000);
  };

  const handleStartAgain = () => {
    setPaths([]);
    setLastStroke(null);
    currentStrokeRef.current = [];
    setStarted(false);
    setShowImage(false);
  };

  const handleSendToBackend = async () => {
    if (!lastStroke || lastStroke.length === 0) {
      Alert.alert('No data', 'Please draw something first!');
      return;
    }

    try {
      const response = await fetch('http://192.168.1.210:8081/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ strokes: lastStroke }),
      });

      const result = await response.json();
      Alert.alert('Prediction Result', `Prediction: ${result.prediction}`);
    } catch (error) {
      console.error('Error:', error);
      Alert.alert('Error', 'Could not connect to backend.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Title Section */}
        <View style={styles.header}>
          <Text style={styles.title}>NeuroPlay</Text>
          <Text style={styles.subtitle}>Games for tracking Parkinson's</Text>
        </View>

        {/* Initial Buttons */}
        {!started && (
          <View style={styles.centered}>
            <TouchableOpacity style={styles.customButton} onPress={handleStart}>
              <Text style={styles.customButtonText}>Drawing</Text>
            </TouchableOpacity>
            <View style={{ height: 20 }} />
            <TouchableOpacity style={[styles.customButton, styles.voiceButton]} onPress={() => {}}>
              <Text style={styles.customButtonText}>Voice</Text>
            </TouchableOpacity>
          </View>
        )}

        {showImage && (
          <View style={styles.centered}>
            <Image
              source={require('./assets/spiral.jpg')}
              style={styles.image}
              resizeMode="contain"
            />
          </View>
        )}

        {!showImage && started && (
          <>
            <View style={styles.canvas} {...panResponder.panHandlers}>
              <Svg height="100%" width="100%">
                {paths.map((stroke, i) => (
                  <Path
                    key={`stroke-${i}`}
                    d={pointsToSvgPath(stroke)}
                    stroke="#222"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentStrokeRef.current.length > 0 && (
                  <Path
                    d={pointsToSvgPath(currentStrokeRef.current)}
                    stroke="#4a90e2"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </Svg>
            </View>

            <View style={styles.dataContainer}>
              <Text style={styles.dataTitle}>Last Stroke Data:</Text>
              <ScrollView style={styles.logContainer}>
                {lastStroke ? (
                  lastStroke.map((point, i) => (
                    <Text key={i} style={styles.dataText}>
                      {`x: ${point.x.toFixed(1)}, y: ${point.y.toFixed(
                        1
                      )}, pressure: ${point.pressure.toFixed(2)}, ts: ${
                        point.timestamp
                      }`}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.dataText}>
                    Draw something to see data here!
                  </Text>
                )}
              </ScrollView>
            </View>

            <View style={styles.footer}>
              <Button title="Start Again" onPress={handleStartAgain} color="#d9534f" />
              <View style={{ height: 10 }} />
              <Button title="Submit to Backend" onPress={handleSendToBackend} color="#4a90e2" />
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4a90e2',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: width * 0.8,
    height: height * 0.5,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4a90e2',
  },
  canvas: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    backgroundColor: '#fff',
    marginBottom: 15,
  },
  dataContainer: {
    flex: 0.4,
  },
  dataTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    color: '#333',
  },
  logContainer: {
    backgroundColor: '#eef2f7',
    padding: 10,
    borderRadius: 8,
  },
  dataText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 18,
  },
  footer: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  customButton: {
    backgroundColor: '#4a90e2',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 25,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  customButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 18,
  },
  voiceButton: {
    backgroundColor: '#888', // Different color to distinguish "Voice"
  },
});
