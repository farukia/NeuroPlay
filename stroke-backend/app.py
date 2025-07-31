from flask import Flask, request, jsonify
import numpy as np
import joblib
from scipy.signal import butter, filtfilt

app = Flask(__name__)

# Load the model (removed scaler)
model = joblib.load('final_model.pickle')

def compute_tremor_energy(signal, fs):
    b, a = butter(4, [3, 8], btype='band', fs=fs)
    filtered = filtfilt(b, a, signal - np.mean(signal))
    return np.sum(filtered ** 2)

def extract_features(strokes):
    if not strokes or len(strokes) < 2:
        return None

    X = np.array([pt['x'] for pt in strokes], dtype=float)
    Y = np.array([pt['y'] for pt in strokes], dtype=float)
    Pressure = np.array([pt['pressure'] for pt in strokes], dtype=float)
    Timestamp = np.array([pt['timestamp'] for pt in strokes], dtype=float)

    Timestamp = Timestamp - Timestamp[0]
    Timestamp /= 1000.0  # Convert ms to seconds

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

    feat_array = np.array(list(features.values()), dtype=float).reshape(1, -1)
    return feat_array

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json()
        strokes = data.get('strokes')

        if not strokes:
            return jsonify({
                'success': False,
                'error': 'No stroke data provided'
            }), 400

        features = extract_features(strokes)
        if features is None:
            return jsonify({
                'success': False,
                'error': 'Not enough data points for feature extraction'
            }), 400

        if features.shape[1] != model.n_features_in_:
            return jsonify({
                'success': False,
                'error': f'Feature vector length mismatch: expected {model.n_features_in_}, got {features.shape[1]}'
            }), 400

        if np.isnan(features).any() or np.isinf(features).any():
            return jsonify({
                'success': False,
                'error': 'Invalid feature values (NaN or Inf)'
            }), 400

        # No scaler used here
        prediction = model.predict(features)
        probas = model.predict_proba(features) if hasattr(model, "predict_proba") else None
        confidence = float(np.max(probas)) if probas is not None else 1.0

        print("Feature vector:", features)
        print("Predicted label:", prediction)
        if probas is not None:
            print("Prediction probabilities:", probas)

        return jsonify({
            'success': True,
            'prediction': int(prediction[0]),
            'confidence': confidence
        })

    except Exception as e:
        print("Error during prediction:", str(e))
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
