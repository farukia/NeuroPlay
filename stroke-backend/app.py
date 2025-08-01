from flask import Flask, request, jsonify
import numpy as np
import joblib
import os
import tempfile

from scipy.signal import butter, filtfilt
from scipy.stats import entropy
import parselmouth
import nolds
from pyunicorn.timeseries.recurrence_plot import RecurrencePlot

app = Flask(__name__)

# Load both models
drawing_model = joblib.load('final_model.pickle')
voice_model = joblib.load('voice_model.pickle')

### --- Drawing Feature Extraction --- ###
def compute_tremor_energy(signal, fs):
    b, a = butter(4, [3, 8], btype='band', fs=fs)
    filtered = filtfilt(b, a, signal - np.mean(signal))
    return np.sum(filtered ** 2)

def extract_drawing_features(strokes):
    if not strokes or len(strokes) < 2:
        return None

    X = np.array([pt['x'] for pt in strokes], dtype=float)
    Y = np.array([pt['y'] for pt in strokes], dtype=float)
    Pressure = np.array([pt['pressure'] for pt in strokes], dtype=float)
    Timestamp = np.array([pt['timestamp'] for pt in strokes], dtype=float)

    Timestamp = Timestamp - Timestamp[0]
    Timestamp /= 1000.0

    time_diffs = np.diff(Timestamp)
    fs = 1 / np.median(time_diffs) if len(time_diffs) > 0 else 100.0

    features = {}
    for name, signal in zip(['x', 'y', 'pressure'], [X, Y, Pressure]):
        features[f'{name}_mean'] = np.mean(signal)
        features[f'{name}_std'] = np.std(signal)
        features[f'{name}_range'] = np.ptp(signal)
        features[f'{name}_tremor_energy'] = compute_tremor_energy(signal, fs)

    dx = np.diff(X)
    dy = np.diff(Y)
    dt = time_diffs + 1e-6
    distances = np.sqrt(dx**2 + dy**2)
    speeds = distances / dt

    features['distance_total'] = np.sum(distances)
    features['duration'] = Timestamp[-1]
    features['speed_mean'] = np.mean(speeds)
    features['speed_std'] = np.std(speeds)

    return np.array(list(features.values()), dtype=float).reshape(1, -1)

### --- Drawing Prediction Endpoint --- ###
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        strokes = data.get('strokes')
        if not strokes:
            return jsonify({'success': False, 'error': 'No stroke data provided'}), 400

        features = extract_drawing_features(strokes)
        if features is None:
            return jsonify({'success': False, 'error': 'Not enough data points'}), 400
        if features.shape[1] != drawing_model.n_features_in_:
            return jsonify({'success': False, 'error': 'Feature mismatch'}), 400

        prediction = drawing_model.predict(features)
        probas = drawing_model.predict_proba(features) if hasattr(drawing_model, 'predict_proba') else None
        confidence = float(np.max(probas)) if probas is not None else 1.0

        return jsonify({
            'success': True,
            'prediction': int(prediction[0]),
            'confidence': confidence
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

### --- Voice Prediction Endpoint --- ###
@app.route('/voice-predict', methods=['POST'])
def voice_predict():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_audio:
            file.save(temp_audio.name)

        snd = parselmouth.Sound(temp_audio.name)
        pitch = snd.to_pitch()
        point_process = parselmouth.praat.call(snd, "To PointProcess (periodic, cc)", 75, 500)

        # Jitter
        jitter_local = parselmouth.praat.call([snd, point_process], "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        jitter_abs = parselmouth.praat.call([snd, point_process], "Get jitter (absolute)", 0, 0, 0.0001, 0.02, 1.3)
        rap = parselmouth.praat.call([snd, point_process], "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
        ppq = parselmouth.praat.call([snd, point_process], "Get jitter (ppq5)", 0, 0, 0.0001, 0.02, 1.3)
        ddp = 3 * rap

        # Shimmer
        shimmer_local = parselmouth.praat.call([snd, point_process], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        shimmer_db = parselmouth.praat.call([snd, point_process], "Get shimmer (local_dB)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        apq3 = parselmouth.praat.call([snd, point_process], "Get shimmer (apq3)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        apq5 = parselmouth.praat.call([snd, point_process], "Get shimmer (apq5)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        apq = parselmouth.praat.call([snd, point_process], "Get shimmer (apq11)", 0, 0, 0.0001, 0.02, 1.3, 1.6)
        dda = 3 * apq3

        # HNR / NHR
        nhr = parselmouth.praat.call(snd, "Get noise-to-harmonics ratio", 0.0, 0.0, 75, 0.1, 1.0)
        hnr = parselmouth.praat.call(snd, "Get harmonics-to-noise ratio", 0.0, 0.0, 75, 0.1, 1.0)

        # Fo, Fhi, Flo
        meanF0 = pitch.get_mean(0, 0, "Hertz")
        minF0 = pitch.get_minimum(0, 0, "Hertz", None)
        maxF0 = pitch.get_maximum(0, 0, "Hertz", None)

        # PPE
        pitch_values = pitch.selected_array['frequency']
        pitch_values = pitch_values[pitch_values > 0]
        pitch_probs, _ = np.histogram(pitch_values, bins=20, density=True)
        ppe = entropy(pitch_probs + 1e-6)

        # DFA
        dfa = nolds.dfa(pitch_values)

        # RPDE
        rp = RecurrencePlot(pitch_values)
        rp_matrix = rp.recurrence_matrix()
        rp_hist = np.histogram(rp_matrix.flatten(), bins=20, density=True)[0]
        rpde = entropy(rp_hist + 1e-6)

        # Spread1, Spread2, D2
        spread1 = np.std(pitch_values)
        spread2 = np.std(np.diff(pitch_values))
        d2 = np.mean(np.square(np.diff(pitch_values)))

        features = np.array([
            meanF0, maxF0, minF0,
            jitter_local, jitter_abs, rap, ppq, ddp,
            shimmer_local, shimmer_db, apq3, apq5, apq, dda,
            nhr, hnr, rpde, dfa, spread1, spread2, d2, ppe
        ]).reshape(1, -1)

        if features.shape[1] != voice_model.n_features_in_:
            return jsonify({'error': 'Voice feature length mismatch'}), 400

        prediction = voice_model.predict(features)
        probas = voice_model.predict_proba(features) if hasattr(voice_model, 'predict_proba') else None
        confidence = float(np.max(probas)) if probas is not None else 1.0

        return jsonify({
            'success': True,
            'prediction': int(prediction[0]),
            'confidence': confidence
        })

    except Exception as e:
        print("Voice prediction error:", str(e))
        return jsonify({'success': False, 'error': str(e)}), 500

    finally:
        try:
            os.remove(temp_audio.name)
        except:
            pass

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
