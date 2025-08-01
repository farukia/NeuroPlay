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
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

const { width, height } = Dimensions.get('window');

export default function App() {
  const [started, setStarted] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [paths, setPaths] = useState([]);
  const [lastStroke, setLastStroke] = useState(null);
  const currentStrokeRef = useRef([]);

  const [recording, setRecording] = useState(null);
  const [recordedURI, setRecordedURI] = useState(null);
  const [recordingActive, setRecordingActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);

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
      const response = await fetch('http://192.168.1.210:5000/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ strokes: lastStroke }),
      });

      const result = await response.json();

      if (response.ok && result.prediction !== undefined) {
        Alert.alert(
          'Prediction Result',
          `Prediction: ${result.prediction === 1 ? 'Parkinson’s Detected' : 'No Parkinson’s'}\nConfidence: ${(result.confidence * 100).toFixed(2)}%`
        );
      } else {
        Alert.alert('Backend Error', result.error || 'An unknown error occurred.');
        console.error('Backend error:', result.error);
      }
    } catch (error) {
      console.error('Network error:', error);
      Alert.alert('Connection Error', 'Could not connect to the backend.');
    }
  };

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission denied', 'Microphone access is required.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setRecordingActive(true);
    } catch (err) {
      console.error('Recording failed', err);
      Alert.alert('Error', 'Failed to start recording.');
    }
  };

  const stopRecording = async () => {
    try {
      setRecordingActive(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordedURI(uri);
      setRecording(null);
      console.log('Saved audio:', uri);
    } catch (err) {
      console.error('Stop recording failed', err);
    }
  };

  const sendVoiceToBackend = async () => {
    if (!recordedURI) {
      Alert.alert('No recording', 'Please record your voice first.');
      return;
    }

    const formData = new FormData();
    formData.append('file', {
      uri: recordedURI,
      name: 'voice.wav',
      type: 'audio/wav',
    });

    try {
      const res = await fetch('http://192.168.1.210:5000/voice-predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      const result = await res.json();
      if (res.ok) {
        Alert.alert(
          'Prediction',
          `Voice Prediction: ${result.prediction === 1 ? 'Parkinson’s Detected' : 'No Parkinson’s'}\nConfidence: ${(result.confidence * 100).toFixed(2)}%`
        );
      } else {
        console.error(result);
        Alert.alert('Error', 'Prediction failed.');
      }
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not reach backend.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>NeuroPlay</Text>
          <Text style={styles.subtitle}>Games for tracking Parkinson's</Text>
        </View>

        {!started && !voiceMode && (
          <View style={styles.centered}>
            <TouchableOpacity style={styles.customButton} onPress={handleStart}>
              <Text style={styles.customButtonText}>Drawing</Text>
            </TouchableOpacity>
            <View style={{ height: 20 }} />
            <TouchableOpacity
              style={[styles.customButton, styles.voiceButton]}
              onPress={() => {
                setVoiceMode(true);
                setStarted(false);
                setShowImage(false);
              }}
            >
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
                      {`x: ${point.x.toFixed(1)}, y: ${point.y.toFixed(1)}, pressure: ${point.pressure.toFixed(2)}, ts: ${point.timestamp}`}
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
              <Button title="Track" onPress={handleSendToBackend} color="#4a90e2" />
            </View>
          </>
        )}

        {voiceMode && (
          <View style={styles.centered}>
            <Text style={{ fontSize: 18, marginBottom: 20 }}>
              Please say: “The quick brown fox jumps over the lazy dog.”
            </Text>

            <TouchableOpacity
              style={styles.customButton}
              onPress={recordingActive ? stopRecording : startRecording}
            >
              <Text style={styles.customButtonText}>
                {recordingActive ? 'Stop Recording' : 'Start Recording'}
              </Text>
            </TouchableOpacity>

            {recordedURI && (
              <>
                <Text style={{ marginTop: 20 }}>Recorded!</Text>
                <TouchableOpacity
                  style={[styles.customButton, { backgroundColor: '#4caf50', marginTop: 10 }]}
                  onPress={sendVoiceToBackend}
                >
                  <Text style={styles.customButtonText}>Send to Backend</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.customButton, { marginTop: 30, backgroundColor: '#999' }]}
              onPress={() => {
                setVoiceMode(false);
                setRecordedURI(null);
              }}
            >
              <Text style={styles.customButtonText}>Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7fa' },
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  header: { alignItems: 'center', marginBottom: 30, marginTop: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#4a90e2' },
  subtitle: { fontSize: 14, color: '#666', marginTop: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  dataContainer: { flex: 0.4 },
  dataTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6, color: '#333' },
  logContainer: {
    backgroundColor: '#eef2f7',
    padding: 10,
    borderRadius: 8,
  },
  dataText: { fontSize: 12, color: '#555', lineHeight: 18 },
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
  customButtonText: { color: 'white', fontWeight: '700', fontSize: 18 },
  voiceButton: { backgroundColor: '#888' },
});
